FROM ubuntu:20.04

RUN apt-get update
RUN apt-get install -y tzdata
RUN apt-get install -y php-fpm git
RUN mkdir /btp-ui

RUN git clone https://github.com/mipxtx/btp-ui.git /btp-ui
RUN cp /btp-ui/config/servers.sample.php /btp-ui/config/servers.php
COPY www.conf /etc/php/7.4/fpm/pool.d/www.conf
COPY run.sh .
RUN chmod +x ./run.sh
EXPOSE 9000
ENTRYPOINT ["./run.sh"]

