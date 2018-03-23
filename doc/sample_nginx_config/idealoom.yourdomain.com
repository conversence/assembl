server {
    listen   80;
    listen   [::]:80;
    # server_name assembl.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    # listen    80;
    # listen   [::]:80;
    listen   443 ssl http2;
    listen   [::]:443 ssl http2;

    # This is the server name, if you're running multiple servers
    # server_name idealoom.yourdomain.com;

    # This assumes usage of letsencrypt.org
    # ssl_certificate     /etc/letsencrypt/live/idealoom.yourdomain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/idealoom.yourdomain.com/privkey.pem;

    # This corresponds to an intermediate configuration on https://mozilla.github.io/server-side-tls/ssl-config-generator/
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA:ECDHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA:ECDHE-ECDSA-DES-CBC3-SHA:ECDHE-RSA-DES-CBC3-SHA:EDH-RSA-DES-CBC3-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA256:AES256-SHA256:AES128-SHA:AES256-SHA:DES-CBC3-SHA:!DSS';
    ssl_prefer_server_ciphers on;
    add_header Strict-Transport-Security max-age=15768000;
    ssl_stapling on;
    ssl_stapling_verify on;
    ## verify chain of trust of OCSP response using Root CA and Intermediate certs
    # ssl_trusted_certificate /path/to/root_CA_cert_plus_intermediates;

    # resolver <IP DNS resolver>;

    add_header x-xss-protection "1; mode=block" always;
    add_header x-frame-options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    server_tokens off;
    # Optional for extra security
    # add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' data: piwik.example.com *.facebook.net ; frame-src 'self' www.youtube.com *.facebook.com ; connect-src 'self' wss://idealoom.yourdomain.com sentry.example.com piwik.example.com ; style-src 'self' 'unsafe-inline' fonts.googleapis.com ; font-src 'self' data: fonts.gstatic.com; img-src 'self' data: piwik.example.com *.facebook.com www.gravatar.com *.googleusercontent.com *.twimg.com *.twitter.com framapic.org";

    location /.well-known {
        #This is for domain verification with let's encrypt
        alias /var/www/html/.well-known;
    }

    location /socket {
        proxy_pass http://localhost:8090/socket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /static {
        #Do NOT put something like "expires modified +1h;" here, it WILL cause problems when deploying a new version.
        #Nor will it help your performance after the first hour...
        autoindex on;

        alias /home/idealoom_user/idealoom/assembl/static;
    }

    location /private_uploads {
      internal;
      alias /home/idealoom_user/idealoom/var/uploads;
    }

    location / {

        include uwsgi_params;
        uwsgi_read_timeout 5m;
        uwsgi_pass unix:///home/idealoom_user/idealoom/var/run/uwsgi.sock;
    }

# So files uploaded to the database are not artificailly limited by nginx
client_max_body_size 500M;

# Save some bandwidth
gzip on;
gzip_http_version 1.1;
gzip_vary on;
gzip_comp_level 6;
gzip_proxied any;
#text/html is implicit
gzip_types text/plain text/css application/json application/ld+json application/x-javascript text/xml application/xml application/xml+rss text/javascript application/javascript text/x-js image/svg+xml font/truetype font/opentype application/vnd.ms-fontobject;

}


