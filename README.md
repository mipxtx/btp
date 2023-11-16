BTP a better than pinba metrics server

starup server: 
``docker-compose up -d`` 

php client:

``cd client/php/old-ext && phpize && ./configure && make && make install``

``echo "extension=btp.so" > /path/to/php.ini``
