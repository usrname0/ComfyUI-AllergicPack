/**
 * RememberMe Extension for ComfyUI
 * Displays Python environment information with change detection.
 * Features a button for immediate population without workflow execution.
 */
import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

const EXTENSION_NAME = "Comfy.RememberMeNode.Enhanced";
const NODE_TYPE_NAME = "RememberMeNode";

// Colors for different states
const NORMAL_COLOR = "#dddddd";
const CHANGED_COLOR = "#ff4444";  // Red for when environment changed
const STABLE_COLOR = "#66ff99";   // Green for stable environment

// Size constraints
const MIN_NODE_WIDTH = 380;   // Minimum width for button and text display
const MIN_NODE_HEIGHT = 320;  // Minimum height for multiline widget and button

const RememberMeExtension = {
    name: EXTENSION_NAME,
    
    // Store last known environment for comparison
    lastEnvironment: null,

    createDisplayWidget: function(nodeInstance) {
        const widgetName = "environment_display";
        
        // Check if widget already exists (prevents duplicates on reload)
        if (nodeInstance.widgets && nodeInstance.widgets.find(w => w.name === widgetName)) {
            return nodeInstance.widgets.find(w => w.name === widgetName);
        }
        
        const widget = ComfyWidgets.STRING(nodeInstance, widgetName, ["STRING", {
            multiline: true,
            default: "Click 'Populate Environment Info' button to collect\ndata for initial run.\n\nOtherwise first run just populates node data.\nSubsequent runs populate, compare and are saved\nto metadata.",
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
        if (!value || typeof value !== 'string' || value.includes("Environment info will appear here")) {
            return null;
        }
        
        // Remove status prefix if present
        const cleanValue = value.replace(/^\[(FIRST RUN|CHANGED|STABLE|POPULATED)\] /, '');
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
        
        const { current_snapshot, comparison_key, populate_requested } = payload;
        
        // Check if there's existing data in the widget (from loaded workflow/metadata)
        const existingValue = displayWidget.value;
        const previousComparisonKey = this.extractComparisonKey(existingValue);
        
        // Also check if we have a stored comparison key on the node instance itself
        const storedComparisonKey = nodeInstance._storedComparisonKey || previousComparisonKey;
        
        // Determine state
        const isFirstRun = (!storedComparisonKey && !this.lastEnvironment) || populate_requested;
        const hasChanged = !populate_requested && storedComparisonKey && storedComparisonKey !== comparison_key;
        
        // Store the new comparison key on the node instance
        nodeInstance._storedComparisonKey = comparison_key;
        
        // Apply visual feedback based on environment state
        if (isFirstRun) {
            // First run or populate button - neutral styling
            displayWidget.inputEl.style.borderColor = NORMAL_COLOR;
            displayWidget.inputEl.style.backgroundColor = "#202020";
            displayWidget.inputEl.style.color = NORMAL_COLOR;
        } else if (hasChanged) {
            // Environment changed - red warning styling
            displayWidget.inputEl.style.borderColor = CHANGED_COLOR;
            displayWidget.inputEl.style.backgroundColor = "rgba(255, 68, 68, 0.1)";
            displayWidget.inputEl.style.color = CHANGED_COLOR;
            
            // Add a temporary pulse effect
            displayWidget.inputEl.style.boxShadow = `0 0 10px ${CHANGED_COLOR}`;
            setTimeout(() => {
                displayWidget.inputEl.style.boxShadow = "none";
            }, 2000);
            
            console.log("[RememberMe] Environment change detected!");
            console.log("[RememberMe] Previous:", storedComparisonKey?.substring(0, 100) + "...");
            console.log("[RememberMe] Current:", comparison_key?.substring(0, 100) + "...");
        } else {
            // Environment stable - green success styling
            displayWidget.inputEl.style.borderColor = "#666";
            displayWidget.inputEl.style.backgroundColor = "rgba(102, 255, 153, 0.05)";
            displayWidget.inputEl.style.color = STABLE_COLOR;
        }
        
        // Store current environment for next comparison
        this.lastEnvironment = comparison_key;
        
        // Add status indicator and update display
        const statusPrefix = populate_requested ? "[POPULATED] " :
                           isFirstRun ? "[FIRST RUN] " : 
                           hasChanged ? "[CHANGED] " : 
                           "[STABLE] ";
        
        displayWidget.value = statusPrefix + current_snapshot;
    },

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name === NODE_TYPE_NAME) {
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
                
                // Add the populate environment button
                this.addWidget(
                    "button", "Populate Environment Info", "populate_env_button",
                    async () => {
                        // Show immediate feedback
                        const displayWidget = this.environmentWidget;
                        if (displayWidget && displayWidget.inputEl) {
                            displayWidget.value = "Collecting environment info...";
                            displayWidget.inputEl.style.borderColor = "#ffaa00";
                            displayWidget.inputEl.style.backgroundColor = "rgba(255, 170, 0, 0.1)";
                        }
                        
                        try {
                            // Call custom API endpoint for isolated environment collection
                            const response = await fetch('/remember_me/populate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' }
                            });
                            
                            if (response.ok) {
                                const result = await response.json();
                                if (result.success && result.ui?.environment_payload) {
                                    RememberMeExtension.updateDisplay(this, result.ui.environment_payload[0]);
                                } else {
                                    throw new Error(result.error || 'Unknown API response format');
                                }
                            } else {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            }
                        } catch (error) {
                            console.warn('[RememberMe] Direct API failed, falling back to queue method:', error);
                            
                            // Show fallback warning
                            if (displayWidget?.inputEl) {
                                displayWidget.value = "Collecting environment info... (running workflow as fallback)";
                            }
                            
                            // Fallback to workflow execution (not ideal but functional)
                            app.queuePrompt(0, 1, {
                                [this.id]: {
                                    inputs: { populate_env: true },
                                    class_type: NODE_TYPE_NAME
                                }
                            });
                        }
                    }
                );
                
                // Set a larger default size to accommodate the multiline widget and button
                const currentSize = this.computeSize();
                this.setSize([
                    Math.max(currentSize[0], Math.max(400, MIN_NODE_WIDTH)), 
                    Math.max(currentSize[1], Math.max(320, MIN_NODE_HEIGHT))
                ]);
            };

            // Override onResize to enforce minimum size constraints
            const originalOnResize = nodeType.prototype.onResize;
            nodeType.prototype.onResize = function(size) {
                // Enforce minimum size to prevent UI breaking
                const constrainedSize = [
                    Math.max(size[0], MIN_NODE_WIDTH),
                    Math.max(size[1], MIN_NODE_HEIGHT)
                ];
                
                // Call original resize with constrained size
                if (originalOnResize) {
                    originalOnResize.call(this, constrainedSize);
                } else {
                    this.size = constrainedSize;
                }
                
                return constrainedSize;
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
console.log(`[${EXTENSION_NAME}] Extension registered with environment change detection and populate button.`);