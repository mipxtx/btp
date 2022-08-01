package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

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
	Id 		int				`json:"id"`
}

type Result struct {
	Jsonrpc string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result"`
	Id 		int				`json:"id"`
}

type Error struct {
	Jsonrpc string          `json:"jsonrpc"`
	Error   json.RawMessage `json:"result"`
	Id 		int				`json:"id"`
}

type MethodError struct{
	error string
}
func (m MethodError) Error() (string) {
	return m.error
}

var data string = ""
var btpMutex sync.Mutex

func main() {

	var wg sync.WaitGroup
	wg.Add(1)
	go serveUdp(12345, wg)
	wg.Add(1)
	go serveTCP(12345, wg)
	wg.Wait()

}

func serveTCP(port int, wg sync.WaitGroup) {
	defer wg.Done()
	// listen to incoming udp packets
	lc, err := net.Listen("tcp", ":" + strconv.Itoa(port))
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

		go tcpAcept(conn)
	}
}

func tcpAcept(conn net.Conn){
	// Будем прослушивать все сообщения разделенные \n
	message, _ := bufio.NewReader(conn).ReadString('\n')
	result := append(serveMethod([]byte(message)), '\n')
	conn.Write(result)
}


func serveUdp(port int, wg sync.WaitGroup){
	defer wg.Done()

	conn, err := net.ListenPacket("udp", ":" + strconv.Itoa(port))
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

func udpProcess(message []byte , dst net.Addr){
	serveMethod(message)
}

func serveMethod(buf []byte) (json.RawMessage){
	message := Packet{}
	unerr := json.Unmarshal(buf, &message)
	if unerr != nil {
		fmt.Println(unerr)
		jsonError := Error{Jsonrpc: "2.0", Error: json.RawMessage("parser error"), Id:-32768}
		jsonResp,_ := json.Marshal(jsonError)
		return jsonResp
	}

	switch message.Method {
	case "multi_add":
		return result(processMulti(message.Params,message.Id))
	case "dump" :
		return result(clickSend(message.Id))

		
	default:
		return result(nil,MethodError{error: "method '" + message.Method + "' unknown"}, message.Id)
	}
}

func result(success json.RawMessage, err error, id int) json.RawMessage {

	if(err != nil){
		jsonError := Error{Jsonrpc: "2.0", Error: json.RawMessage(err.Error())}
		if(id != 0){
			jsonError.Id = id;
		}
		jsonResp,_ := json.Marshal(jsonError)
		return jsonResp
	}else{
		jsonResult := Result{Jsonrpc: "2.0", Result: success}
		if(id != 0){
			jsonResult.Id = id;
		}
		jsonResp, _ := json.Marshal(jsonResult)
		return jsonResp
	}

}

func processMulti(message json.RawMessage, id int) (json.RawMessage,  error, int){
	now := time.Now().Format("2006-01-02 15:04:05")
	out := ""
	jdata := MultiAdd{}
	err := json.Unmarshal(message, &jdata)
	if err != nil {
		fmt.Println(err)
		return nil, err, id
	}
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

	succ,_:= json.Marshal("success")
	return succ,err,id
}

func clickSend(id int) (json.RawMessage, error, int){
	btpMutex.Lock()
	str := data
	data = ""
	btpMutex.Unlock()
	params := url.Values{}
	params.Add("query", "INSERT INTO btp.timer FORMAT TabSeparated")

	url := "http://127.0.0.1:8123/?" + params.Encode()
	fmt.Println(url)
	r := bytes.NewReader([]byte(str))
	resp, err := http.Post(url, "text/plain; charset=UTF-8", r)
	if err != nil {
		return nil, err, id

	}
	if resp.StatusCode != 200 {
		return nil, MethodError{error: resp.Status}, id
	}
	succ,_ := json.Marshal("success")
	return succ, err, id
}



