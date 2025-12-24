# Install steps

1. Create a folder with the version number appended

    ```bash
    NEWVER=vX.Y.Z
    cd /opt/
    sudo git clone https://github.com/averyhabbott/netbox-deviceportvisualizer.git
    cd netbox-deviceportvisualizer
    sudo git checkout $NEWVER
    ```

2. Run the install script

    ```bash
    cd /opt/netbox-deviceportvisualizer/install
    sudo ./install.sh
    ```

3. Create the deviceportvisualizer user

    ```bash
    sudo adduser --system deviceportvisualizer
    sudo chown --recursive deviceportvisualizer /opt/netbox-deviceportvisualizer/models
    ```

4. Set the netboxUrl and apiKey variables in config.js

    - API key needs to be tied to a user that has read privileges to DCIM models in NetBox

5. Install the deviceportvisualizer service

    ```bash
    sudo cp -v /opt/netbox-deviceportvisualizer/install/*.service /etc/systemd/system/
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

7. Restart NGINX

    ```bash
    sudo nginx -s reload
    ```

8. Enable CORS

    ```bash
    sudo nano /opt/netbox/netbox/netbox/configuration.py
    CORS_ORIGIN_ALLOW_ALL = True
    sudo systemctl restart netbox
    ```

9. Create Custom Links in NetBox

    ```csv
    name,object_types,weight,enabled,link_text,link_url
    deviceportvisualizer-device,dcim.device,100,true,PortVisualizer,"/deviceportvisualizer/?model={{ object.device_type.slug }}"
    deviceportvisualizer-devicetype,dcim.devicetype,100,true,PortVisualizer,"/deviceportvisualizer/?model={{ object.slug }}"
    deviceportvisualizer-interface,dcim.interface,100,true,PortVisualizer,"/deviceportvisualizer/?model={{ object.device.device_type.slug }}&interface={{ object.name | replace('/','%2F') }}"
    ```
