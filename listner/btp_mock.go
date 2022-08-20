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

type ClickLeaf struct {
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
}
type GetResult struct {
	Name     string    `json:"name"`
	Scale    int       `json:"scale"`
	Counters [][]int64 `json:"counters"`
}
type MultiGetRequest struct {
	Names  []string `json:"names"`
	Ts     int64    `json:"ts"`
	Offset int      `json:"offset"`
	Limit  int      `json:"limit"`
	Scale  int      `json:"scale"`
}

type MultiGetResult struct {
	Scale int         `json:"scale"`
	Data  []GetResult `json:"data"`
}

var data string = ""
var btpMutex sync.Mutex

var clickhost string = ""

func Marshal(v any) json.RawMessage {
	res, _ := json.Marshal(v)
	return res
}

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
		return Marshal(jsonError)
	} else {
		jsonResult := Result{Jsonrpc: "2.0", Result: success}
		if id != 0 {
			jsonResult.Id = id
		}

		return Marshal(jsonResult)
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

	return Marshal("success"), nil, id
}

func clickSend(id int) (json.RawMessage, error, int) {

	err := dump()
	if err != nil {
		return nil, err, id
	}
	return Marshal("success"), err, id
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
	return nil
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

	cdata := ClickLeaf{}
	json.Unmarshal([]byte(string(out)), &cdata)

	for _, row := range cdata.Data {
		arr = append(arr, row[0])
	}

	return Marshal(NameTreeResult{arr}), err, id
}

func processMultiget(names []string, scale int) ([]GetResult, error) {

	fmt.Println(scale)

	sql := "select concat(type,'~~',service,'~~',operation) as name," +
		" toUnixTimestamp(toStartOfInterval(date, interval " + strconv.Itoa(scale) + " second)) * 1000000 as dt," +
		" count() as cnt," +
		" round(avg(time)) as avg," +
		" round(quantile(0.5)(time)) as p50," +
		" round(quantile(0.8)(time)) as p80," +
		" round(quantile(0.95)(time)) as p95," +
		" round(quantile(0.99)(time)) as p99," +
		" min(time) as mi," +
		" max(time) as ma" +
		" from timer" +
		" where name in ("

	for i, val := range names {
		if i != 0 {
			sql += ","
		}
		sql += "'" + val + "'"
	}
	sql += ")" +
		" group by dt, name" +
		" order by name, dt"

	fmt.Println(sql)
	params := url.Values{}
	params.Add("query", sql+"' FORMAT JSONCompactStrings")
	url := "http://" + clickhost + "/?" + params.Encode()

	resp, err := http.Get(url)

	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		return nil, MethodError{error: resp.Status}
	}
	defer resp.Body.Close()
	out, _ := ioutil.ReadAll(resp.Body)
	fmt.Println(out)
	return nil, MethodError{"Test"}
}

func multi_get(message json.RawMessage, id int) (json.RawMessage, error, int) {

	req := MultiGetRequest{}
	json.Unmarshal(message, &req)

	fmt.Println(string(message))

	mget, err := processMultiget(req.Names, req.Scale)
	if err != nil {
		return nil, err, id
	}
	out := MultiGetResult{}
	out.Scale = req.Scale * 1000000
	out.Data = mget

	return Marshal(mget), nil, id
}
