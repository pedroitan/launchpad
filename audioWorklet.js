class LoopProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferData = null;
        this.position = 0;
        this.isPlaying = false;

        // Handle messages from the main thread
        this.port.onmessage = (event) => {
            if (event.data.bufferData) {
                this.bufferData = event.data.bufferData;
                this.position = 0;
                this.isPlaying = true;
            } else if (event.data.type === 'stop') {
                this.isPlaying = false;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        
        if (!this.bufferData || !this.isPlaying) {
            // Output silence when not playing
            output.forEach(channel => channel.fill(0));
            return true;
        }

        // Process each channel
        for (let channelIndex = 0; channelIndex < output.length; channelIndex++) {
            const outputChannel = output[channelIndex];
            const bufferChannel = this.bufferData[channelIndex];
            
            if (!bufferChannel) continue;

            // Fill the output buffer
            for (let i = 0; i < outputChannel.length; i++) {
                outputChannel[i] = bufferChannel[this.position];
                this.position++;
                
                // Reset position for seamless loop
                if (this.position >= bufferChannel.length) {
                    this.position = 0;
                }
            }
        }

        // Apply gain
        const gain = parameters.gain?.[0] ?? 1;
        if (gain !== 1) {
            output.forEach(channel => {
                for (let i = 0; i < channel.length; i++) {
                    channel[i] *= gain;
                }
            });
        }

        return true;
    }

    static get parameterDescriptors() {
        return [{
            name: 'gain',
            defaultValue: 1,
            minValue: 0,
            maxValue: 1,
            automationRate: 'k-rate'
        }];
    }
}

registerProcessor('loop-processor', LoopProcessor);
