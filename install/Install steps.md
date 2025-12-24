# Install steps

1. Clone the Git repo and check out latest version

```bash
cd /opt
sudo git clone https://github.com/averyhabbott/netbox-deviceportvisualizer.git
cd netbox-deviceportvisualizer
sudo git checkout vX.Y.Z
```

2. Create the deviceportvisualizer user

```bash
sudo adduser --system --group deviceportvisualizer
sudo chown --recursive deviceportvisualizer /opt/netbox-deviceportvisualizer/models
```

3. Set the netboxUrl and apiKey variables in config.js

- API key needs to be tied to a user that has read privileges to DCIM models in NetBox

4. Run the install script

```bash
cd /opt/netbox-deviceportvisualizer/install
sudo chmod 744 install.sh
sudo ./install.sh
```

5. Install the deviceportvisualizer service

```bash
sudo cp -v /opt/netbox-deviceportvisualizer/install/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now deviceportvisualizer
systemctl status deviceportvisualizer.service
```

6. Edit the NetBox NGINX file to include a new proxy

- TCP Port is defined in server.py and can be adjusted to avoid conflicts

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
