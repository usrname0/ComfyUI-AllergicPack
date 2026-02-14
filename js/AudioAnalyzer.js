/**
 * AudioAnalyzer Extension for ComfyUI
 * Adds an Analyze button and display widgets for BPM and key detection results.
 */
import { app } from "../../../scripts/app.js";

const EXTENSION_NAME = "Comfy.AudioAnalyzerNode";
const NODE_TYPE_NAME = "AudioAnalyzerNode";

const NORMAL_COLOR = "#dddddd";
const ANALYZING_COLOR = "#ffaa00";
const SUCCESS_COLOR = "#66ff99";
const ERROR_COLOR = "#ff4444";

const MIN_NODE_WIDTH = 300;
const MIN_NODE_HEIGHT = 200;

const AudioAnalyzerExtension = {
    name: EXTENSION_NAME,

    /**
     * Update the read-only display widgets with analysis results.
     */
    updateDisplayWidgets(node, result) {
        const fields = [
            { name: "bpm", label: "BPM", value: String(result.bpm) },
            { name: "key", label: "Key", value: result.key },
            { name: "scale", label: "Scale", value: result.scale },
            { name: "keyscale", label: "Key Scale", value: result.keyscale },
        ];

        for (const field of fields) {
            let widget = node.widgets?.find(w => w.name === field.name);
            if (widget) {
                widget.value = field.value;
            }
        }

        // Update status widget
        let statusWidget = node.widgets?.find(w => w.name === "status");
        if (statusWidget) {
            statusWidget.value = "Analysis complete";
            if (statusWidget.inputEl) {
                statusWidget.inputEl.style.color = SUCCESS_COLOR;
            }
        }

        node.setDirtyCanvas(true, false);
    },

    /**
     * Create read-only display widgets on the node.
     */
    createDisplayWidgets(node) {
        // Skip if already created
        if (node.widgets?.find(w => w.name === "status")) {
            return;
        }

        const configs = [
            { name: "status", label: "Status", default: "Not analyzed yet" },
            { name: "bpm", label: "BPM", default: "-" },
            { name: "key", label: "Key", default: "-" },
            { name: "scale", label: "Scale", default: "-" },
            { name: "keyscale", label: "Key Scale", default: "-" },
        ];

        for (const cfg of configs) {
            const widget = node.addWidget("text", cfg.name, cfg.default, () => {}, {
                serialize: false,
            });
            // Make it look read-only
            widget.computeSize = function() {
                return [MIN_NODE_WIDTH - 20, 20];
            };
        }
    },

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name !== NODE_TYPE_NAME) return;

        // Handle execution results from the backend
        const originalOnExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function(message) {
            originalOnExecuted?.apply(this, arguments);

            if (message?.analysis_result?.length > 0) {
                AudioAnalyzerExtension.updateDisplayWidgets(this, message.analysis_result[0]);
            }
        };

        // When node is first added to the canvas
        const originalOnAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function() {
            originalOnAdded?.apply(this, arguments);

            AudioAnalyzerExtension.createDisplayWidgets(this);

            // Add the Analyze button
            this.addWidget("button", "Analyze", "analyze_button", async () => {
                // Find the file_path widget
                const filePathWidget = this.widgets?.find(w => w.name === "file_path");
                const filePath = filePathWidget?.value?.trim();

                const statusWidget = this.widgets?.find(w => w.name === "status");

                if (!filePath) {
                    if (statusWidget) {
                        statusWidget.value = "No file path set";
                        if (statusWidget.inputEl) {
                            statusWidget.inputEl.style.color = ERROR_COLOR;
                        }
                    }
                    this.setDirtyCanvas(true, false);
                    return;
                }

                // Show analyzing state
                if (statusWidget) {
                    statusWidget.value = "Analyzing...";
                    if (statusWidget.inputEl) {
                        statusWidget.inputEl.style.color = ANALYZING_COLOR;
                    }
                }
                this.setDirtyCanvas(true, false);

                try {
                    const response = await fetch("/allergic/audio_analyzer/analyze", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ file_path: filePath }),
                    });

                    const data = await response.json();

                    if (data.success) {
                        AudioAnalyzerExtension.updateDisplayWidgets(this, data.result);
                    } else {
                        if (statusWidget) {
                            statusWidget.value = `Error: ${data.error}`;
                            if (statusWidget.inputEl) {
                                statusWidget.inputEl.style.color = ERROR_COLOR;
                            }
                        }
                        this.setDirtyCanvas(true, false);
                    }
                } catch (err) {
                    console.error("[AudioAnalyzer] Analyze request failed:", err);
                    if (statusWidget) {
                        statusWidget.value = `Request failed: ${err.message}`;
                        if (statusWidget.inputEl) {
                            statusWidget.inputEl.style.color = ERROR_COLOR;
                        }
                    }
                    this.setDirtyCanvas(true, false);
                }
            });

            // Set a reasonable default size
            const currentSize = this.computeSize();
            this.setSize([
                Math.max(currentSize[0], MIN_NODE_WIDTH),
                Math.max(currentSize[1], MIN_NODE_HEIGHT),
            ]);
        };

        // Restore display widgets when loading from workflow
        const originalOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function() {
            originalOnConfigure?.apply(this, arguments);
            AudioAnalyzerExtension.createDisplayWidgets(this);
            this.computeSize();
            this.setDirtyCanvas(true, false);
        };

        // Enforce minimum size
        const originalOnResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function(size) {
            const constrained = [
                Math.max(size[0], MIN_NODE_WIDTH),
                Math.max(size[1], MIN_NODE_HEIGHT),
            ];
            if (originalOnResize) {
                originalOnResize.call(this, constrained);
            } else {
                this.size = constrained;
            }
            return constrained;
        };
    },
};

app.registerExtension(AudioAnalyzerExtension);
console.log(`[${EXTENSION_NAME}] Extension registered.`);
