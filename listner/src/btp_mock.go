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
	"runtime"
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
	Scale  string `json:"scale"`
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
var prevDump = time.Now()

func logTrace(m string) {
	b := make([]byte, 2048) // adjust buffer size to be larger than expected stack
	n := runtime.Stack(b, false)
	s := string(b[:n])
	fmt.Println(m + " at\n" + s)
}

func main() {
	fmt.Println("starting up")
	val, exists := os.LookupEnv("CLICK")
	if !exists {
		log.Fatal("CLICK not set")
	}
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
	go serveTimers(60, &wg, func() { calckNameTree() })

	wg.Add(1)
	go serveTimers(dumpTimeout, &wg, func() { _ = dump() })

	wg.Add(1)
	go serveTimers(15, &wg, func() { calckCounters() })
	wg.Add(1)
	go serveTimers(15, &wg, func() { dumpNames() })

	wg.Wait()

}

// We make sigHandler receive a channel on which we will report the value of var quit
func sigHandler(q chan bool) {
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP, syscall.SIGKILL)
	for s := range c {

		switch s {
		case syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP, syscall.SIGKILL:
			logTrace("got signal " + s.String())
			q <- true
			return
		}
	}

}

func serveTimers(timeout int, wg *sync.WaitGroup, f func()) {
	defer wg.Done()

	sig := make(chan bool)
	go sigHandler(sig)

	ticker := time.NewTicker(time.Duration(timeout) * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			f()
		case <-sig:
			logTrace("exit timer")
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

func toStartOf(t time.Time, seconds int) int64 {
	return t.Unix() - t.Unix()%int64(seconds)
}

func dump() error {
	fmt.Println("dumping timers")
	start := time.Now()
	btpMutex.Lock()
	str := data
	data = ""
	btpMutex.Unlock()
	host, _ := os.Hostname()

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

	total := int(time.Now().Sub(start) / 1000)
	btpMutex.Lock()
	data += time.Now().Format("2006-01-02 15:04:05") + "\tservice\tbtp.listner\t" + host + "\tdump\t" + strconv.Itoa(total) + "\n"
	btpMutex.Unlock()
	return nil
}

func calckNameTree() {
	fmt.Println("dumping name_tree")
	in := time.Now()
	clickSelect("insert into btp.name_tree select distinct service, 'service','branch' from btp.timer where type='service' and date > now() - interval 60*3 second")
	clickSelect("insert into btp.name_tree select distinct server, concat('service~~',service),'branch' from btp.timer where type='service' and server != '' and  date > now() - interval 60*3 second ")
	clickSelect("insert into btp.name_tree select distinct operation, concat('service~~',service),'leaf' from btp.timer where type='service' and operation != '' and  date > now() - interval 60*3 second ")
	clickSelect("insert into btp.name_tree select distinct service, 'script','branch' from btp.timer where type='script' and date > now() - interval 60*3 second")
	clickSelect("insert into btp.name_tree select distinct server, concat('script~~',service),'branch' from btp.timer where type='script' and server != '' and date > now() - interval 60*3 second")
	clickSelect("insert into btp.name_tree select distinct operation, concat('script~~',service,'~~',server),'leaf' from btp.timer where type='script' and operation != '' and server !='' and  date > now() - interval 60*3 second")
	host, _ := os.Hostname()
	total := int(time.Now().Sub(in) / 1000)
	btpMutex.Lock()
	data += time.Now().Format("2006-01-02 15:04:05") + "\tservice\tbtp.listner\t" + host + "\tcalc_name_tree\t" + strconv.Itoa(total) + "\n"
	btpMutex.Unlock()
}

func calckCounters() {
	fmt.Println("dumping counters")
	start := time.Now()
	times := [4]int{5, 60, 420, 3600}
	in := time.Now()
	sql := ""
	for _, i := range times {
		if toStartOf(prevDump, i) < toStartOf(start, i) {
			sql = "insert into btp.counters_" + strconv.Itoa(i) + "\n" +
				"select concat(type,'~~',service, '~~',server, '~~',operation) as name,\n" +
				"       toUnixTimestamp(toStartOfInterval(date, interval " + strconv.Itoa(i) + " second)) as dt,\n" +
				"       round(avg(time)) as avg,\n" +
				"       count() as cnt,\n" +
				"       round(quantile(0.49)(time)) as p50,\n" +
				"       round(quantile(0.79)(time)) as p80,\n" +
				"       round(quantile(0.94)(time)) as p95,\n" +
				"       round(quantile(0.98)(time)) as p99,\n" +
				"       round(quantile(0.99)(time)) as p100,\n" +
				"       min(time) as mi,\n" +
				"       max(time) as ma\n" +
				"from btp.timer where date > now() - interval " + strconv.Itoa(i) + "*3 second\n" +
				"group by name,dt"
			clickSelect(sql)

			sql = "insert into btp.counters_" + strconv.Itoa(i) + "\n" +
				"select concat(type,'~~',service, '~~',operation) as name,\n" +
				"       toUnixTimestamp(toStartOfInterval(date, interval " + strconv.Itoa(i) + " second)) as dt,\n" +
				"       round(avg(time)) as avg,\n" +
				"       count() as cnt,\n" +
				"       round(quantile(0.49)(time)) as p50,\n" +
				"       round(quantile(0.79)(time)) as p80,\n" +
				"       round(quantile(0.94)(time)) as p95,\n" +
				"       round(quantile(0.98)(time)) as p99,\n" +
				"       round(quantile(0.99)(time)) as p100,\n" +
				"       min(time) as mi,\n" +
				"       max(time) as ma\n" +
				"from btp.timer where date > now() - interval " + strconv.Itoa(i) + "*3 second\n" +
				"group by name,dt"
			clickSelect(sql)
		}
	}
	host, _ := os.Hostname()
	total := int(time.Now().Sub(in) / 1000)
	btpMutex.Lock()
	data += time.Now().Format("2006-01-02 15:04:05") + "\tservice\tbtp.listner\t" + host + "\tcalc_counters\t" + strconv.Itoa(total) + "\n"
	btpMutex.Unlock()
	prevDump = start
}

func dumpNames() {
	fmt.Println("dumping names")
	start := time.Now()
	times := [4]int{5, 60, 420, 3600}
	for _, i := range times {
		sql := "insert into btp.names\n" +
			"select concat (type,'~~',service,'~~',server,'~~',operation) as name,\n" +
			"       concat(type,'~~') as prefix,\n" +
			"       concat('~~',server,'~~',operation) as suffix,\n" +
			"       sum(time) as orderby,\n" +
			"       toUnixTimestamp(max(date)) as dd,\n" +
			"       " + strconv.Itoa(i) + "\n" +
			"from btp.timer\n" +
			"where type='script'\n" +
			"  and server!=''\n" +
			"  and operation!=''\n" +
			"  and date > now() - interval 30 second\n" +
			"group by name,prefix,suffix"
		clickSelect(sql)
	}
	host, _ := os.Hostname()
	total := int(time.Now().Sub(start) / 1000)
	btpMutex.Lock()
	data += time.Now().Format("2006-01-02 15:04:05") + "\tservice\tbtp.listner\t" + host + "\tcalc_names\t" + strconv.Itoa(total) + "\n"
	btpMutex.Unlock()
	prevDump = start

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

	sql := "select distinct name from btp.name_tree where prefix='" + prefix + "' and ntype='" + ntype + "'"

	params := url.Values{}
	params.Add("query", sql+" FORMAT JSONCompactStrings")
	params.Add("database", "btp")
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

	var arr []string
	for _, row := range cdata.Data {
		arr = append(arr, row[0])
	}

	js, _ := json.Marshal(NameTreeResult{arr})
	return js, nil, id
}

func processMultiget(names []string, scale string) (MultiGetResult, error) {

	if len(names) < 1 {
		return MultiGetResult{}, MethodError{"not enought names"}
	}

	sql := "select distinct * from btp.counters_" + scale +
		" where time > toUnixTimestamp(now() - interval " + scale + " * 3000 second) and name in ("

	for i, val := range names {
		if i != 0 {
			sql += ","
		}
		sql += "'" + val + "'"
	}
	sql += ") order by time"

	fmt.Println(sql)
	res, _ := clickSelect(sql)

	clickRes := make(map[string]GetCounters)

	for _, s := range res {
		name := s[0]
		value := make([]int64, 10)
		for i := 0; i < 10; i++ {
			j, _ := strconv.Atoi(s[i+1])
			value[i] = int64(j)
		}
		value[0] *= 1000000

		clickRes[name] = append(clickRes[name], value)
	}

	iScale, _ := strconv.Atoi(scale)

	out := MultiGetResult{}
	out.Scale = iScale * 1000000
	for name, data := range clickRes {
		item := GetResult{}
		item.Name = name
		item.Counters = data
		item.Scale = iScale * 1000000
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

	mget, err := processMultiget(req.Names, req.Scale)
	if err != nil {
		return nil, err, id
	}

	js, _ := json.Marshal(mget)
	return js, nil, id
}

func getGraph(message json.RawMessage, id int) (json.RawMessage, error, int) {
	req := GetRequest{}
	json.Unmarshal(message, &req)

	names := make([]string, 1)
	names[0] = req.Name

	res, _ := processMultiget(names, req.Scale)

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

	sql := ""
	sql = "select distinct name,time from btp.names where prefix='" + req.Prefix + "' and suffix='" + req.Suffix + "'" +
		" and scale='" + req.Scale + "' order by orderby LIMIT " + strconv.Itoa(req.Limit) + " OFFSET " + strconv.Itoa(req.Offset)

	fmt.Println(sql)
	cres, _ := clickSelect(sql)
	fmt.Println(cres)
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
	defer resp.Body.Close()
	out, _ := ioutil.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		fmt.Println("cilick select fail" + string(out) + "\nquery:" + sql)
		return nil, MethodError{error: resp.Status}
	}

	cresp := ClickResp{}
	jerr := json.Unmarshal(out, &cresp)

	if jerr != nil {
		return nil, jerr
	}

	return cresp.Data, nil
}
