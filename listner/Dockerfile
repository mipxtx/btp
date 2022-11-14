FROM golang:1.8

EXPOSE 12345



#COPY ./src/* .
#RUN go build -v -o /usr/local/bin/app ./...
#RUN chmod +x /usr/local/bin/app

RUN mkdir /start
COPY ./startup.sh /start
RUN chmod +x /start/startup.sh
ENTRYPOINT ["/start/startup.sh"]