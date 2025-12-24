#!/opt/deviceportvisualizer/venv/bin/env python3
"""
Flask server with model file handling for NetBox Device Port Visualizer
"""
from flask import Flask, request, jsonify, send_from_directory
import json
import os
from urllib.parse import unquote
from werkzeug.middleware.proxy_fix import ProxyFix

# Define the TCP port number to listen on
PORT = 8002

app = Flask(__name__, static_folder='.', static_url_path='')

# Apply proxy fix for reverse proxy support
app.wsgi_app = ProxyFix(app.wsgi_app)

MODELS_DIR = 'models'

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@app.route('/api/save-model', methods=['OPTIONS'])
def options_save():
    response = jsonify({})
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/api/save-model', methods=['POST'])
def handle_save_model():
    """Save a model layout to the models directory"""
    try:
        # Get the JSON data from the request body
        model_data = request.get_json()

        if not model_data:
            return jsonify({'error': 'Missing model data'}), 400

        device_slug = model_data['deviceType']['slug']

        # Ensure models directory exists
        os.makedirs(MODELS_DIR, exist_ok=True)

        # Save the model file
        filename = f"{device_slug}_layout.json"
        filepath = os.path.join(MODELS_DIR, filename)

        with open(filepath, 'w') as f:
            json.dump(model_data, f, indent=2)

        return jsonify({'success': True, 'filename': filename})

    except Exception as e:
        return jsonify({'error': f'Error saving model: {str(e)}'}), 500

@app.route('/api/load-model/<device_slug>', methods=['OPTIONS'])
def options_load(device_slug):
    response = jsonify({})
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/api/load-model/<device_slug>', methods=['GET'])
def handle_load_model(device_slug):
    """Load a model layout from the models directory"""
    try:
        device_slug = unquote(device_slug)
        filename = f"{device_slug}_layout.json"
        filepath = os.path.join(MODELS_DIR, filename)

        if not os.path.exists(filepath):
            return jsonify({'error': 'Model not found'}), 404

        with open(filepath, 'r') as f:
            model_data = json.load(f)

        return jsonify(model_data)

    except Exception as e:
        return jsonify({'error': f'Error loading model: {str(e)}'}), 500

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'false'
    return response

if __name__ == '__main__':
    os.makedirs(MODELS_DIR, exist_ok=True)
    app.run(host='127.0.0.1', port=PORT, debug=True)