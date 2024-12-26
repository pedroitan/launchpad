document.addEventListener('DOMContentLoaded', function() {
    const pads = document.querySelectorAll('.music-pad');
    const sliders = document.querySelectorAll('.volume-slider');
    const muteButtons = document.querySelectorAll('.mute-button');
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let masterBPM = 120;
    
    class BPMDetector {
        static detectBPM(audioBuffer) {
            const sampleRate = audioBuffer.sampleRate;
            const channelData = audioBuffer.getChannelData(0);
            
            const minBPM = 60;
            const maxBPM = 180;
            const bufferSize = 2048;
            const threshold = 0.25;
            
            const energyData = [];
            for (let i = 0; i < channelData.length; i += bufferSize) {
                let energy = 0;
                for (let j = 0; j < bufferSize && (i + j) < channelData.length; j++) {
                    energy += Math.abs(channelData[i + j]);
                }
                energyData.push(energy / bufferSize);
            }
            
            const maxEnergy = Math.max(...energyData);
            const normalizedEnergy = energyData.map(e => e / maxEnergy);
            
            const peaks = [];
            for (let i = 1; i < normalizedEnergy.length - 1; i++) {
                if (normalizedEnergy[i] > threshold && 
                    normalizedEnergy[i] > normalizedEnergy[i - 1] && 
                    normalizedEnergy[i] > normalizedEnergy[i + 1]) {
                    peaks.push(i * bufferSize / sampleRate);
                }
            }
            
            const intervals = [];
            for (let i = 1; i < peaks.length; i++) {
                intervals.push(peaks[i] - peaks[i - 1]);
            }
            
            const intervalCounts = {};
            intervals.forEach(interval => {
                const bpm = Math.round(60 / interval);
                if (bpm >= minBPM && bpm <= maxBPM) {
                    intervalCounts[bpm] = (intervalCounts[bpm] || 0) + 1;
                }
            });
            
            let maxCount = 0;
            let detectedBPM = 120;
            
            for (const [bpm, count] of Object.entries(intervalCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    detectedBPM = parseInt(bpm);
                }
            }
            
            return detectedBPM;
        }
    }

    class PreciseLooper {
        constructor(audioBuffer, audioContext, padElement) {
            this.audioBuffer = audioBuffer;
            this.audioContext = audioContext;
            this.isPlaying = false;
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.source = null;
            this.padElement = padElement;
            this.originalBPM = BPMDetector.detectBPM(audioBuffer);
            this.isMuted = false;
            this.lastVolume = 1;
            this.createBPMDisplay();
        }

        createBPMDisplay() {
            const bpmDisplay = document.createElement('div');
            bpmDisplay.className = 'bpm-display';
            bpmDisplay.textContent = `${this.originalBPM} BPM`;
            this.padElement.appendChild(bpmDisplay);
        }

        updatePlaybackRate() {
            if (this.source) {
                const rate = masterBPM / this.originalBPM;
                this.source.playbackRate.setValueAtTime(rate, this.audioContext.currentTime);
            }
        }

        play(volume = 1) {
            if (this.isPlaying) {
                this.stop();
            }

            this.source = this.audioContext.createBufferSource();
            this.source.buffer = this.audioBuffer;
            this.source.connect(this.gainNode);
            
            const effectiveVolume = this.isMuted ? 0 : volume;
            this.gainNode.gain.setValueAtTime(effectiveVolume, this.audioContext.currentTime);
            this.lastVolume = volume;

            this.source.loop = true;
            this.source.loopStart = 0;
            this.source.loopEnd = this.audioBuffer.duration;
            
            const rate = masterBPM / this.originalBPM;
            this.source.playbackRate.setValueAtTime(rate, this.audioContext.currentTime);
            
            this.source.start(0);
            this.isPlaying = true;

            // Enhanced visual feedback
            this.padElement.classList.add('active');
            this.updatePadVisuals(true);
        }

        stop() {
            if (this.source) {
                this.source.stop();
                this.source.disconnect();
                this.source = null;
            }
            this.isPlaying = false;
            
            // Remove visual feedback
            this.padElement.classList.remove('active');
            this.updatePadVisuals(false);
        }

        updatePadVisuals(isPlaying) {
            if (isPlaying) {
                this.padElement.style.transform = 'scale(1.05)';
                this.padElement.style.opacity = '1';
            } else {
                this.padElement.style.transform = 'scale(1)';
                this.padElement.style.opacity = '0.8';
            }
        }

        setVolume(volume) {
            this.lastVolume = volume;
            if (!this.isMuted) {
                this.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            }
        }

        toggleMute() {
            this.isMuted = !this.isMuted;
            const volume = this.isMuted ? 0 : this.lastVolume;
            this.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            return this.isMuted;
        }
    }

    // Create master BPM control with enhanced styling
    const masterBPMControl = document.createElement('div');
    masterBPMControl.className = 'master-bpm-control';

    const bpmLabel = document.createElement('div');
    bpmLabel.textContent = 'Master BPM';
    bpmLabel.style.marginBottom = '5px';

    const bpmValue = document.createElement('div');
    bpmValue.textContent = masterBPM;
    bpmValue.style.marginBottom = '5px';
    bpmValue.style.fontWeight = 'bold';

    const bpmSlider = document.createElement('input');
    bpmSlider.type = 'range';
    bpmSlider.min = '60';
    bpmSlider.max = '180';
    bpmSlider.value = masterBPM;
    bpmSlider.style.width = '200px';

    masterBPMControl.appendChild(bpmLabel);
    masterBPMControl.appendChild(bpmValue);
    masterBPMControl.appendChild(bpmSlider);
    document.querySelector('.container').insertBefore(masterBPMControl, document.querySelector('.pads-row'));

    bpmSlider.addEventListener('input', () => {
        masterBPM = parseInt(bpmSlider.value);
        bpmValue.textContent = masterBPM;
        
        Object.values(loopers).forEach(looper => {
            if (looper.isPlaying) {
                looper.updatePlaybackRate();
            }
        });
    });

    // Pre-load audio buffers
    const audioBuffers = {};
    const loopers = {};

    // Pre-load all audio files
    pads.forEach((pad, index) => {
        const audioElement = document.getElementById(`audio${index + 1}`);
        
        fetch(audioElement.src)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                const sampleRate = audioBuffer.sampleRate;
                const quantizedBuffer = audioContext.createBuffer(
                    audioBuffer.numberOfChannels,
                    Math.floor(audioBuffer.length),
                    sampleRate
                );

                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const originalData = audioBuffer.getChannelData(channel);
                    const newData = quantizedBuffer.getChannelData(channel);
                    for (let i = 0; i < originalData.length; i++) {
                        newData[i] = originalData[i];
                    }
                }

                audioBuffers[`audio${index + 1}`] = quantizedBuffer;
                loopers[`audio${index + 1}`] = new PreciseLooper(quantizedBuffer, audioContext, pad);
            })
            .catch(error => console.error('Error loading audio:', error));
    });

    // Add pad click handlers with enhanced visual feedback
    pads.forEach((pad, index) => {
        // Set initial opacity
        pad.style.opacity = '0.8';
        
        pad.addEventListener('click', () => {
            const looper = loopers[`audio${index + 1}`];
            
            if (pad.classList.contains('active')) {
                looper.stop();
            } else {
                const slider = document.querySelector(`#volume${index + 1}`);
                const volume = slider ? slider.value : 1;
                looper.play(volume);
            }
        });

        // Add hover effects
        pad.addEventListener('mouseenter', () => {
            if (!pad.classList.contains('active')) {
                pad.style.transform = 'translateY(-2px)';
            }
        });

        pad.addEventListener('mouseleave', () => {
            if (!pad.classList.contains('active')) {
                pad.style.transform = 'translateY(0)';
            }
        });
    });

    // Add volume slider functionality
    sliders.forEach((slider, index) => {
        slider.addEventListener('input', () => {
            const volume = slider.value;
            const looper = loopers[`audio${index + 1}`];
            if (looper) {
                looper.setVolume(volume);
            }
        });
    });

    // Add mute button functionality with enhanced visual feedback
    muteButtons.forEach((button, index) => {
        button.addEventListener('click', () => {
            const looper = loopers[`audio${index + 1}`];
            if (looper) {
                const isMuted = looper.toggleMute();
                button.textContent = isMuted ? 'Muted' : 'Unmuted';
                button.classList.toggle('muted', isMuted);
            }
        });
    });
});
