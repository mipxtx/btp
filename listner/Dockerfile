FROM golang:1.8


COPY . .
RUN go build -v -o /usr/local/bin/app ./...
EXPOSE 12345
CMD ["/usr/local/bin/app"]