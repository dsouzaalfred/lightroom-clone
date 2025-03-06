document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('uploadBtn');
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const resetBtn = document.getElementById('resetBtn');
    const cropBtn = document.getElementById('cropBtn');
    const cancelCropBtn = document.getElementById('cancelCropBtn');
    const aspectRatioSelect = document.getElementById('aspectRatio');
    const sliders = ['brightness', 'contrast', 'saturation'].map(id => document.getElementById(id));
    
    let currentImage = null;
    let originalImage = null;
    let updateTimer = null;
    let cropper = null;
    let isCropping = false;

    // Aspect ratio map
    const aspectRatios = {
        'free': NaN,
        '1:1': 1,
        '4:3': 4/3,
        '16:9': 16/9,
        '3:4': 3/4,
        '2:3': 2/3
    };
    
    // Handle image upload
    uploadBtn.addEventListener('click', () => {
        imageUpload.click();
    });
    
    imageUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            if (response.ok) {
                currentImage = data.filename;
                originalImage = data.filename;
                updateImagePreview(currentImage);
                resetAdjustments();
                // Show crop panel after image upload
                document.querySelector('.crop-panel').classList.remove('hidden');
            } else {
                alert('Error uploading image: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error uploading image');
        }
    });
    
    // Handle adjustments
    async function applyAdjustments(overrideAdjustments = null) {
        if (!currentImage) return;
        
        const adjustments = overrideAdjustments || {
            brightness: parseFloat(document.getElementById('brightness').value),
            contrast: parseFloat(document.getElementById('contrast').value),
            saturation: parseFloat(document.getElementById('saturation').value)
        };
        
        try {
            const img = imagePreview.querySelector('img');
            if (!img) return;
            
            // Add loading class to indicate adjustment in progress
            if (!img.classList.contains('adjusting')) {
                img.classList.add('adjusting');
            }
            
            const response = await fetch('/edit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: currentImage,
                    adjustments
                })
            });
            
            const data = await response.json();
            if (response.ok) {
                // Create a new Image object to preload
                const newImage = new Image();
                
                // Set up onload before setting src to ensure it catches
                newImage.onload = () => {
                    requestAnimationFrame(() => {
                        img.src = newImage.src;
                        img.classList.remove('adjusting');
                        currentImage = data.edited_filename;
                    });
                };
                
                // Add cache-busting and start loading
                newImage.src = `/uploads/${data.edited_filename}?t=${Date.now()}`;
            } else {
                console.error('Error applying adjustments:', data.error);
                img.classList.remove('adjusting');
            }
        } catch (error) {
            console.error('Error:', error);
            const img = imagePreview.querySelector('img');
            if (img) img.classList.remove('adjusting');
        }
    }

    // Add event listeners to sliders
    let isAdjusting = false;
    let pendingUpdate = null;
    let debounceTimer = null;
    
    sliders.forEach(slider => {
        let lastValue = slider.value;
        
        slider.addEventListener('input', () => {
            // Only update if value has changed
            if (lastValue === slider.value) return;
            lastValue = slider.value;
            
            // Clear any existing timers
            if (updateTimer) clearTimeout(updateTimer);
            if (debounceTimer) clearTimeout(debounceTimer);
            
            // If we're already adjusting, store the latest values
            if (isAdjusting) {
                pendingUpdate = {
                    brightness: parseFloat(document.getElementById('brightness').value),
                    contrast: parseFloat(document.getElementById('contrast').value),
                    saturation: parseFloat(document.getElementById('saturation').value)
                };
                return;
            }
            
            // Set a new timer to update after a short delay
            updateTimer = setTimeout(async () => {
                isAdjusting = true;
                await applyAdjustments();
                
                // If there's a pending update, apply it after a short delay
                if (pendingUpdate) {
                    const finalUpdate = pendingUpdate;
                    pendingUpdate = null;
                    
                    // Add a small delay before applying the final update
                    debounceTimer = setTimeout(async () => {
                        isAdjusting = false;
                        if (finalUpdate) {
                            await applyAdjustments(finalUpdate);
                        }
                    }, 50);
                } else {
                    isAdjusting = false;
                }
            }, 16); // Using requestAnimationFrame timing (~16ms)
        });
    });
    
    // Reset adjustments
    resetBtn.addEventListener('click', () => {
        resetAdjustments();
    });
    
    function resetAdjustments() {
        document.getElementById('brightness').value = 1;
        document.getElementById('contrast').value = 1;
        document.getElementById('saturation').value = 1;
        
        if (originalImage) {
            currentImage = originalImage;
            updateImagePreview(currentImage);
            // Reset cropper but keep crop panel visible
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            isCropping = false;
        }
    }
    
    function updateImagePreview(filename) {
        // Destroy existing cropper if it exists
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        if (filename) {
            let img = imagePreview.querySelector('img');
            if (!img) {
                // Create new image element only if it doesn't exist
                img = document.createElement('img');
                img.alt = 'Preview';
                img.style.opacity = '0';
                imagePreview.innerHTML = '';
                imagePreview.appendChild(img);
                
                // Add load event listener for smooth fade-in
                img.onload = () => {
                    img.style.transition = 'opacity 0.2s ease-in-out';
                    img.style.opacity = '1';
                };
            }
            
            // Preload the new image
            const newImage = new Image();
            newImage.onload = () => {
                img.src = newImage.src;
            };
            newImage.src = `/uploads/${filename}?t=${Date.now()}`;
            
            // Show crop panel when an image is loaded
            document.querySelector('.crop-panel').classList.remove('hidden');
        } else {
            imagePreview.innerHTML = `<p class="placeholder-text">Upload an image to start editing</p>`;
            document.querySelector('.crop-panel').classList.add('hidden');
        }
    }

    // Initialize cropping
    function initCropping() {
        if (!currentImage) return;
        isCropping = true;

        // Get the image element
        const image = imagePreview.querySelector('img');
        if (!image) return;

        // Initialize Cropper.js
        cropper = new Cropper(image, {
            viewMode: 1,
            aspectRatio: aspectRatios[aspectRatioSelect.value],
            autoCropArea: 1,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false
        });
    }

    // Apply crop
    async function applyCrop() {
        if (!cropper || !currentImage) return;

        try {
            // Get crop data
            const cropData = cropper.getData(true); // rounded values

            const response = await fetch('/crop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: currentImage,
                    crop: cropData
                })
            });

            const data = await response.json();
            if (response.ok) {
                updateImagePreview(data.filename);
                currentImage = data.filename;
                isCropping = false;
            } else {
                console.error('Error applying crop:', data.error);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    // Cancel crop
    function cancelCrop() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        updateImagePreview(currentImage);
        isCropping = false;
    }

    // Handle aspect ratio change
    aspectRatioSelect.addEventListener('change', () => {
        if (cropper) {
            cropper.setAspectRatio(aspectRatios[aspectRatioSelect.value]);
        } else {
            initCropping();
        }
    });

    // Add crop button event listeners
    cropBtn.addEventListener('click', applyCrop);
    cancelCropBtn.addEventListener('click', cancelCrop);

    // Add double-click handler to start cropping
    imagePreview.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'IMG' && !isCropping) {
            initCropping();
        }
    });

    function updateImagePreview(filename) {
        // Destroy existing cropper if it exists
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        imagePreview.innerHTML = `<img src="/uploads/${filename}" alt="Preview">`;
    }
});
