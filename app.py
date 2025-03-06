from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from PIL import Image
import os
import cv2
import numpy as np
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        return jsonify({'filename': filename}), 200

@app.route('/edit', methods=['POST'])
def edit_image():
    data = request.json
    filename = data.get('filename')
    adjustments = data.get('adjustments', {})
    
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    try:
        # Load image using OpenCV
        img = cv2.imread(filepath)
        
        # Apply adjustments
        if 'brightness' in adjustments:
            img = cv2.convertScaleAbs(img, alpha=adjustments['brightness'], beta=0)
        
        if 'contrast' in adjustments:
            img = cv2.convertScaleAbs(img, alpha=adjustments['contrast'], beta=0)
        
        if 'saturation' in adjustments:
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            hsv[:,:,1] = hsv[:,:,1] * adjustments['saturation']
            img = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        
        # Save edited image
        edited_filename = f'edited_{filename}'
        edited_filepath = os.path.join(app.config['UPLOAD_FOLDER'], edited_filename)
        cv2.imwrite(edited_filepath, img)
        
        return jsonify({'edited_filename': edited_filename}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.run(host='0.0.0.0', port=5003, debug=True)
