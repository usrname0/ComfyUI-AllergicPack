// In ComfyUI/custom_nodes/RememberMe/js/RememberMe.js
// Fixed version - properly handles environment comparison across loads
import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

const extensionName = "Comfy.RememberMeNode.Simplified";
const nodeTypeName = "RememberMeNode";

// Colors for different states
const NORMAL_COLOR = "#dddddd";
const CHANGED_COLOR = "#ff4444";  // Red for when environment changed
const STABLE_COLOR = "#66ff99";   // Green for stable environment

const RememberMeExtension = {
    name: extensionName,
    
    // Store last known environment for comparison
    lastEnvironment: null,

    createDisplayWidget: function(nodeInstance) {
        const widgetName = "environment_display";
        
        // Check if widget already exists
        if (nodeInstance.widgets && nodeInstance.widgets.find(w => w.name === widgetName)) {
            return nodeInstance.widgets.find(w => w.name === widgetName);
        }
        
        const widget = ComfyWidgets.STRING(nodeInstance, widgetName, ["STRING", {
            multiline: true,
            default: "Environment info will appear here after execution...",
            serialize: false
        }], app).widget;
        
        // Style the widget
        widget.inputEl.readOnly = true;
        widget.inputEl.style.fontFamily = "monospace";
        widget.inputEl.style.fontSize = "12px";
        widget.inputEl.style.backgroundColor = "var(--comfy-input-bg, #333)";
        widget.inputEl.style.color = NORMAL_COLOR;
        widget.inputEl.style.border = "2px solid #555";
        widget.inputEl.style.borderRadius = "4px";
        widget.inputEl.style.padding = "12px";
        widget.inputEl.style.lineHeight = "1.4";
        widget.inputEl.style.whiteSpace = "pre";
        widget.inputEl.rows = 15;
        widget.inputEl.style.minHeight = "250px";
        widget.inputEl.style.transition = "border-color 0.3s ease, background-color 0.3s ease";
        
        return widget;
    },

    extractComparisonKey: function(value) {
        if (!value || value.includes("Environment info will appear here")) {
            return null;
        }
        
        // Remove status prefix if present
        const cleanValue = value.replace(/^\[(FIRST RUN|CHANGED|STABLE)\] /, '');
        // Remove timestamp line for comparison
        const lines = cleanValue.split('\n');
        return lines.filter(line => !line.startsWith('Captured:')).join('\n');
    },

    updateDisplay: function(nodeInstance, payload) {
        let displayWidget = nodeInstance.environmentWidget;
        
        if (!displayWidget) {
            displayWidget = RememberMeExtension.createDisplayWidget(nodeInstance);
            nodeInstance.environmentWidget = displayWidget;
        }
        
        if (!displayWidget || !displayWidget.inputEl || !payload) {
            return;
        }
        
        const { current_snapshot, comparison_key } = payload;
        
        // Check if there's existing data in the widget (from loaded workflow/metadata)
        const existingValue = displayWidget.value;
        const previousComparisonKey = this.extractComparisonKey(existingValue);
        
        // Also check if we have a stored comparison key on the node instance itself
        const storedComparisonKey = nodeInstance._storedComparisonKey || previousComparisonKey;
        
        // Determine state
        const isFirstRun = !storedComparisonKey && !this.lastEnvironment;
        const hasChanged = storedComparisonKey && storedComparisonKey !== comparison_key;
        
        // Store the new comparison key on the node instance
        nodeInstance._storedComparisonKey = comparison_key;
        
        // Apply visual feedback
        if (isFirstRun) {
            // First run - subtle green tint
            displayWidget.inputEl.style.borderColor = "#666";
            displayWidget.inputEl.style.backgroundColor = "rgba(102, 255, 153, 0.05)";
            displayWidget.inputEl.style.color = STABLE_COLOR;
        } else if (hasChanged) {
            // Environment changed - highlight in orange
            displayWidget.inputEl.style.borderColor = CHANGED_COLOR;
            displayWidget.inputEl.style.backgroundColor = "rgba(255, 68, 68, 0.1)";
            displayWidget.inputEl.style.color = CHANGED_COLOR;
            
            // Add a temporary pulse effect
            displayWidget.inputEl.style.boxShadow = `0 0 10px ${CHANGED_COLOR}`;
            setTimeout(() => {
                displayWidget.inputEl.style.boxShadow = "none";
            }, 2000);
            
            console.log("[RememberMe] Environment change detected!");
            console.log("[RememberMe] Previous:", storedComparisonKey.substring(0, 100) + "...");
            console.log("[RememberMe] Current:", comparison_key.substring(0, 100) + "...");
        } else {
            // Environment stable - subtle green tint
            displayWidget.inputEl.style.borderColor = "#666";
            displayWidget.inputEl.style.backgroundColor = "rgba(102, 255, 153, 0.05)";
            displayWidget.inputEl.style.color = STABLE_COLOR;
        }
        
        // Store current environment for next comparison
        this.lastEnvironment = comparison_key;
        
        // Add status indicator and update display
        const statusPrefix = isFirstRun ? "[FIRST RUN] " : 
                           hasChanged ? "[CHANGED] " : 
                           "[STABLE] ";
        
        displayWidget.value = statusPrefix + current_snapshot;
    },

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name === nodeTypeName) {
            const originalOnExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                originalOnExecuted?.apply(this, arguments);
                
                if (message?.environment_payload && Array.isArray(message.environment_payload) && message.environment_payload.length > 0) {
                    const payload = message.environment_payload[0];
                    RememberMeExtension.updateDisplay(this, payload);
                }
            };

            const originalOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                originalOnConfigure?.apply(this, arguments);
                RememberMeExtension.createDisplayWidget(this);
                
                // Immediately extract and store comparison key from existing widget data
                const displayWidget = this.environmentWidget;
                if (displayWidget && displayWidget.value) {
                    const comparisonKey = RememberMeExtension.extractComparisonKey(displayWidget.value);
                    if (comparisonKey) {
                        // Store it on the node instance itself
                        this._storedComparisonKey = comparisonKey;
                        // Also update the global last environment
                        RememberMeExtension.lastEnvironment = comparisonKey;
                        console.log("[RememberMe] Loaded existing environment data from workflow");
                    }
                }
                
                this.computeSize();
                this.setDirtyCanvas(true, false);
            };

            const originalOnAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function() {
                originalOnAdded?.apply(this, arguments);
                RememberMeExtension.createDisplayWidget(this);
                
                // Set a larger default size to accommodate the multiline widget
                const currentSize = this.computeSize();
                this.setSize([Math.max(currentSize[0], 400), Math.max(currentSize[1], 300)]);
            };

            // Override serialize to ensure comparison key is saved
            const originalSerialize = nodeType.prototype.serialize;
            nodeType.prototype.serialize = function() {
                const data = originalSerialize ? originalSerialize.apply(this, arguments) : {};
                
                // Include the stored comparison key in serialization
                if (this._storedComparisonKey) {
                    data._storedComparisonKey = this._storedComparisonKey;
                }
                
                return data;
            };

            // Override configure to restore comparison key
            const originalConfigure = nodeType.prototype.configure;
            nodeType.prototype.configure = function(data) {
                if (originalConfigure) {
                    originalConfigure.apply(this, arguments);
                }
                
                // Restore the comparison key if it exists
                if (data._storedComparisonKey) {
                    this._storedComparisonKey = data._storedComparisonKey;
                }
            };
        }
    }
};

app.registerExtension(RememberMeExtension);
console.log(`[${extensionName}] Extension registered - fixed comparison with proper state persistence.`);