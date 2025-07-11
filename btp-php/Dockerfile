FROM php:8.4-fpm

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y git

RUN mkdir /btp-ui
RUN git clone https://github.com/mipxtx/btp-ui.git /btp-ui
COPY servers.php /btp-ui/config/servers.php
COPY php.ini /usr/local/etc/php/conf.d

#COPY src /btp-ui
#COPY www.conf /etc/php/8.4/fpm/pool.d/www.conf
#EXPOSE 9000


