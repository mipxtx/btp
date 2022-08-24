package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type NameTree struct {
	Prefix string `json:"prefix"`
	Depth  int    `json:"depth"`
	Sep    string `json:"sep"`
	Ntype  string `json:"ntype"`
	Offset int    `json:"offset"`
	Limit  int    `json:"limit"`
	Sortby string `json:"sortby"`
	Power  bool   `json:"power"`
}

type ClickResp struct {
	Meta []struct {
		Name string `json:"name"`
		Type string `json:"type"`
	} `json:"meta"`
	Data       [][]string `json:"data"`
	Rows       int        `json:"rows"`
	Statistics struct {
		Elapsed   float64 `json:"elapsed"`
		RowsRead  int     `json:"rows_read"`
		BytesRead int     `json:"bytes_read"`
	} `json:"statistics"`
}

type MultiAdd struct {
	Data []struct {
		Name string `json:"name"`
		Cl   []int  `json:"cl"`
	} `json:"data"`
}

type Packet struct {
	Jsonrpc string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
	Id      int             `json:"id"`
}

type Result struct {
	Jsonrpc string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result"`
	Id      int             `json:"id"`
}

type Error struct {
	Jsonrpc string `json:"jsonrpc"`
	Error   string `json:"error"`
	Id      int    `json:"id"`
}

type NameTreeResult struct {
	Branches []string `json:"branches"`
}

type MethodError struct {
	error string
}

func (m MethodError) Error() string {
	return m.error
}

type GetRequest struct {
	Name   string `json:"name"`
	Ts     int64  `json:"ts"`
	Offset int    `json:"offset"`
	Limit  int    `json:"limit"`
	Scale  string `json:"scale"`
}
type GetResult struct {
	Name     string    `json:"name"`
	Scale    int       `json:"scale"`
	Counters [][]int64 `json:"counters"`
}

type GetCounters [][]int64

type MultiGetRequest struct {
	Names  []string `json:"names"`
	Ts     int64    `json:"ts"`
	Offset int      `json:"offset"`
	Limit  int      `json:"limit"`
	Scale  string   `json:"scale"`
}

type MultiGetResult struct {
	Scale int         `json:"scale"`
	Data  []GetResult `json:"data"`
}

type GetNamesRequest struct {
	Prefix string `json:"prefix"`
	Suffix string `json:"suffix"`
	Sep    string `json:"sep"`
	Offset int    `json:"offset"`
	Limit  int    `json:"limit"`
	Sortby string `json:"sortby"`
	Power  bool   `json:"power"`
	Scale  string `json:"scale"`
}

type GetNameResultItem struct {
	Name string `json:"name"`
	Ts   int64  `json:"ts"`
}

type GetNamesResult struct {
	NamesTs []GetNameResultItem `json:"names_ts"`
	Scale   int                 `json:"scale"`
}

var data string = ""
var btpMutex sync.Mutex

var clickhost string = ""

func main() {

	val, exists := os.LookupEnv("CLICK")
	if !exists {
		log.Fatal("CLICK not set")
	}
	fmt.Println("CLICK: " + val)
	clickhost = val

	val, exists = os.LookupEnv("DUMP_TIMEOUT")
	if !exists {
		log.Fatal("DUMP_TIMEOUT not set")
	}

	dumpTimeout, _ := strconv.Atoi(val)
	if dumpTimeout < 1 {
		log.Fatal("DUMP_TIMEOUT must be grater then 0")
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go serveUdp(12345, &wg)
	wg.Add(1)
	go serveTCP(12345, &wg)
	wg.Add(1)
	go serveTimers(dumpTimeout, &wg)
	wg.Wait()

}

// We make sigHandler receive a channel on which we will report the value of var quit
func sigHandler(q chan bool) {
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGINT, syscall.SIGTERM)
	for s := range c {
		switch s {
		case syscall.SIGINT, syscall.SIGTERM:
			q <- true
			os.Exit(0)
		}
	}

}

func serveTimers(timeout int, wg *sync.WaitGroup) {
	defer wg.Done()

	sig := make(chan bool)
	go sigHandler(sig)

	ticker := time.NewTicker(time.Duration(timeout) * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			_ = dump()
		case <-sig:
			fmt.Println("exit")
			return
		}
	}
}

func serveTCP(port int, wg *sync.WaitGroup) {
	defer wg.Done()
	// listen to incoming udp packets
	lc, err := net.Listen("tcp", ":"+strconv.Itoa(port))
	if err != nil {
		log.Fatal("tcp listen err:" + err.Error())
	}
	defer lc.Close()

	for {
		conn, err := lc.Accept()
		if err != nil {
			log.Fatal("accept err:" + err.Error())
		}
		defer conn.Close()

		go tcpAccept(conn)
	}
}

func tcpAccept(conn net.Conn) {
	message, _ := bufio.NewReader(conn).ReadString('\n')
	result := append(serveMethod([]byte(message)), '\n')
	conn.Write(result)
}

func serveUdp(port int, wg *sync.WaitGroup) {
	defer wg.Done()

	conn, err := net.ListenPacket("udp", ":"+strconv.Itoa(port))
	if err != nil {
		log.Fatal("udp listen err:" + err.Error())
	}
	defer conn.Close()

	for {
		buf := make([]byte, 65536)
		n, dst, err := conn.ReadFrom(buf)
		if err != nil {
			continue
		}
		go udpProcess(buf[:n], dst)
	}
}

func udpProcess(message []byte, dst net.Addr) {
	serveMethod(message)
}

func serveMethod(buf []byte) json.RawMessage {
	message := Packet{}
	unerr := json.Unmarshal(buf, &message)
	if unerr != nil {
		fmt.Println(unerr)
		jsonError := Error{Jsonrpc: "2.0", Error: "parser error", Id: -32768}
		jsonResp, _ := json.Marshal(jsonError)
		return jsonResp
	}
	switch message.Method {
	case "multi_add":
		return result(processMulti(message.Params, message.Id))
	case "dump":
		return result(clickSend(message.Id))
	case "get_name_tree":
		return result(get_name_tree(message.Params, message.Id))
	case "multi_get":
		return result(multi_get(message.Params, message.Id))
	case "get":
		return result(getGraph(message.Params, message.Id))
	case "get_names":
		return result(getNames(message.Params, message.Id))
	default:
		fmt.Println(string(buf))
		return result(nil, MethodError{error: "method '" + message.Method + "' unknown"}, message.Id)
	}
}

func result(success json.RawMessage, err error, id int) json.RawMessage {

	if err != nil {
		jsonError := Error{Jsonrpc: "2.0", Error: err.Error()}
		if id != 0 {
			jsonError.Id = id
		}
		js, _ := json.Marshal(jsonError)
		return js
	} else {
		jsonResult := Result{Jsonrpc: "2.0", Result: success}
		if id != 0 {
			jsonResult.Id = id
		}
		js, _ := json.Marshal(jsonResult)
		return js
	}
}

func processMulti(message json.RawMessage, id int) (json.RawMessage, error, int) {
	now := time.Now().Format("2006-01-02 15:04:05")
	out := ""
	jdata := MultiAdd{}
	json.Unmarshal(message, &jdata)

	for _, d := range jdata.Data {
		name := ""
		pices := strings.Split(d.Name, "~~")
		switch len(pices) {
		case 3:
			name = pices[0] + "\t" + pices[1] + "" + "\t" + "\t" + pices[2]
		case 4:
			name = pices[0] + "\t" + pices[1] + "\t" + pices[2] + "\t" + pices[3]
		default:
			fmt.Println("error name: " + d.Name)
			continue
		}
		for _, cl := range d.Cl {
			out += now + "\t" + name + "\t" + strconv.Itoa(cl) + "\n"
		}
	}
	btpMutex.Lock()
	data += out
	btpMutex.Unlock()

	js, _ := json.Marshal("success")
	return js, nil, id
}

func clickSend(id int) (json.RawMessage, error, int) {

	err := dump()
	if err != nil {
		return nil, err, id
	}
	js, _ := json.Marshal("success")
	return js, nil, id

}

func dump() error {
	btpMutex.Lock()
	str := data
	data = ""
	btpMutex.Unlock()
	params := url.Values{}
	params.Add("query", "INSERT INTO btp.timer FORMAT TabSeparated")
	url := "http://" + clickhost + "/?" + params.Encode()
	r := bytes.NewReader([]byte(str))
	resp, err := http.Post(url, "text/plain; charset=UTF-8", r)
	if err != nil {
		return err

	}
	if resp.StatusCode != 200 {
		return MethodError{error: resp.Status}
	}

	clickUpdate("truncate table btp.branch")
	clickUpdate("insert into btp.branch select distinct type, service from btp.timer where date > now() - interval 5*3000 second")
	clickUpdate("insert into btp.branch select distinct concat(type,'~~',service), server from btp.timer where server != '' AND date > now() - interval 5*3000 second")
	clickUpdate("truncate table btp.leaf")
	clickUpdate("insert into btp.leaf select distinct concat(type,'~~',service), operation from btp.timer where operation != '' AND date > now() - interval 5*3000 second")
	clickUpdate("insert into btp.leaf select distinct concat(type,'~~',service, '~~', server), operation from btp.timer where server != '' AND operation != '' AND date > now() - interval 5*3000 second")
	return nil
}

func clickUpdate(sql string) {
	r := bytes.NewReader([]byte(sql))
	resp, _ := http.Post("http://"+clickhost, "text/sql", r)
	if resp.StatusCode != 200 {
		defer resp.Body.Close()
		out, _ := ioutil.ReadAll(resp.Body)
		fmt.Println("dump error: " + strconv.Itoa(resp.StatusCode) + "\n" + string(out))
	}
}

func get_name_tree(message json.RawMessage, id int) (json.RawMessage, error, int) {
	jdata := NameTree{}
	err := json.Unmarshal(message, &jdata)
	if err != nil {
		fmt.Println(err)
		return nil, err, id
	}
	prefix := jdata.Prefix
	ntype := jdata.Ntype

	var arr []string
	params := url.Values{}
	params.Add("query", "select distinct "+ntype+" from btp."+ntype+" where name='"+prefix+"' FORMAT JSONCompactStrings")
	url := "http://" + clickhost + "/?" + params.Encode()

	resp, err := http.Get(url)

	if err != nil {
		return nil, err, id
	}
	if resp.StatusCode != 200 {
		return nil, MethodError{error: resp.Status}, id
	}
	defer resp.Body.Close()
	out, _ := ioutil.ReadAll(resp.Body)

	cdata := ClickResp{}
	json.Unmarshal([]byte(string(out)), &cdata)

	for _, row := range cdata.Data {
		arr = append(arr, row[0])
	}

	js, _ := json.Marshal(NameTreeResult{arr})
	return js, nil, id
}

func processMultiget(names []string, scale int) (MultiGetResult, error) {

	if len(names) < 1 {
		return MultiGetResult{}, MethodError{"not enought names"}
	}

	sql := ""

	if scale == 5 {

		var sqlName string
		var sqlWhere string
		split := strings.Split(names[0], "~~")

		if len(split) == 3 {
			sqlName = " concat(type,'~~',service, '~~',operation) as name,"
			sqlWhere = " AND server=''"
		} else {
			sqlName = " concat(type,'~~',service,'~~',server, '~~',operation) as name,"
			sqlWhere = ""
		}

		sql = "select" +
			sqlName +
			" toUnixTimestamp(toStartOfInterval(date, interval 5 second)) * 1000000 as dt," +
			" round(avg(time)) as avg," +
			" count() as cnt," +
			" round(quantile(0.49)(time)) as p50," +
			" round(quantile(0.79)(time)) as p80," +
			" round(quantile(0.94)(time)) as p95," +
			" round(quantile(0.98)(time)) as p99," +
			" round(quantile(0.99)(time)) as p100," +
			" min(time) as mi," +
			" max(time) as ma" +
			" from btp.timer" +
			" where name in ("

		for i, val := range names {
			if i != 0 {
				sql += ","
			}
			sql += "'" + val + "'"
		}
		sql += ")"
		sql += sqlWhere
		sql += " group by dt, name order by name, dt"
	} else {
		sql = "select" +
			" name," +
			" time," +
			" cnt," +
			" avg," +
			" p50," +
			" p80," +
			" p95," +
			" p99," +
			" min," +
			" max" +
			" from btp.counters" +
			" where name in ("

		for i, val := range names {
			if i != 0 {
				sql += ","
			}
			sql += "'" + val + "'"
		}
		sql += ")" +
			" AND scale=" + strconv.Itoa(scale) +
			" order by name, time"
	}

	//fmt.Println(sql)
	res, _ := clickSelect(sql)

	clickRes := make(map[string]GetCounters)

	for _, s := range res {
		name := s[0]
		value := make([]int64, 10)
		for i := 0; i < 10; i++ {
			j, _ := strconv.Atoi(s[i+1])
			value[i] = int64(j)
		}

		clickRes[name] = append(clickRes[name], value)
	}

	out := MultiGetResult{}
	out.Scale = scale * 1000000
	for name, data := range clickRes {
		item := GetResult{}
		item.Name = name
		item.Counters = data
		item.Scale = scale * 1000000
		out.Data = append(out.Data, item)
	}

	return out, nil
}

func multi_get(message json.RawMessage, id int) (json.RawMessage, error, int) {

	req := MultiGetRequest{}
	json.Unmarshal(message, &req)

	scale, _ := strconv.Atoi(req.Scale)

	if scale < 1 {
		return nil, MethodError{"scale must be > 0"}, id
	}

	mget, err := processMultiget(req.Names, scale)
	if err != nil {
		return nil, err, id
	}

	js, _ := json.Marshal(mget)
	return js, nil, id
}

func getGraph(message json.RawMessage, id int) (json.RawMessage, error, int) {
	req := GetRequest{}
	json.Unmarshal(message, &req)
	scale, _ := strconv.Atoi(req.Scale)

	names := make([]string, 1)
	names[0] = req.Name

	res, _ := processMultiget(names, scale)

	var data GetResult
	if len(res.Data) > 0 {
		data = res.Data[0]
	} else {
		data = GetResult{}
	}
	jres, _ := json.Marshal(data)
	return jres, nil, id
}

func getNames(message json.RawMessage, id int) (json.RawMessage, error, int) {
	req := GetNamesRequest{}
	json.Unmarshal(message, &req)

	pref := strings.Split(req.Prefix, "~~")
	suff := strings.Split(req.Suffix, "~~")

	sql := "select concat (type,'~~',service,'~~',server,'~~',operation) as name, toUnixTimestamp(max(date)) time" +
		" from btp.timer" +
		" where type='" + pref[0] + "' and server='" + suff[1] + "' and operation='" + suff[2] + "'" +
		" and date > now() - interval 1 day" +
		" group by name"

	cres, _ := clickSelect(sql)
	out := make([]GetNameResultItem, len(cres))

	for i, name := range cres {
		ts, _ := strconv.Atoi(name[1])
		out[i].Name = name[0]
		out[i].Ts = int64(ts * 1000000)
	}
	scale, _ := strconv.Atoi(req.Scale)
	jout, _ := json.Marshal(GetNamesResult{out, scale * 1000000})
	return jout, nil, id
}

func clickSelect(sql string) ([][]string, error) {
	r := bytes.NewReader([]byte(sql + " FORMAT JSONCompactStrings"))
	resp, err := http.Post("http://"+clickhost, "text/sql", r)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		return nil, MethodError{error: resp.Status}
	}
	defer resp.Body.Close()
	out, _ := ioutil.ReadAll(resp.Body)

	cresp := ClickResp{}
	jerr := json.Unmarshal(out, &cresp)

	if jerr != nil {
		return nil, jerr
	}

	return cresp.Data, nil
}
