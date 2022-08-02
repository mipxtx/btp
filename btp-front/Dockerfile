FROM ubuntu:20.04

RUN apt-get update
RUN apt-get -y install tzdata
RUN apt-get -y install nginx git

RUN mkdir /btp-ui
RUN git clone https://github.com/mipxtx/btp-ui.git /btp-ui

RUN cd  /btp-ui/www && cp -r btp-private-sample btp-private


COPY default.conf /etc/nginx/sites-available/default
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]