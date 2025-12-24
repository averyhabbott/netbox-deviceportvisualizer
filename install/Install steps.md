# Install steps

1. Create a folder with the version number appended

```bash
NEWVER=0.0.1
sudo mkdir /opt/deviceportvisualizer-$NEWVER
sudo cp --recursive * /opt/deviceportvisualizer-$NEWVER/
sudo ln -sfn /opt/deviceportvisualizer-$NEWVER/ /opt/deviceportvisualizer
```

2. Create the deviceportvisualizer user

```bash
sudo adduser --system --group deviceportvisualizer
sudo chown --recursive deviceportvisualizer /opt/deviceportvisualizer/models
```

3. Set the netboxUrl and apiKey variables in config.js

- API key needs to be tied to a user that has read privileges to DCIM models in NetBox

4. Run the install script

```bash
cd /opt/deviceportvisualizer/install
sudo chmod 700 install.sh
sudo ./install.sh
```

5. Install the deviceportvisualizer service

```bash
sudo cp -v /opt/deviceportvisualizer/install/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now deviceportvisualizer
systemctl status deviceportvisualizer.service
```

6. Edit the NetBox NGINX file to include a new proxy

```bash
    location /deviceportvisualizer/ {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        rewrite ^/deviceportvisualizer/?(.*) /$1 break;
    }
```
