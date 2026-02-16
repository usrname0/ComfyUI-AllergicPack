/**
 * RememberMe Extension for ComfyUI
 * Displays Python environment information with change detection.
 * Features a diff widget showing only what changed between runs,
 * and a button for immediate population without workflow execution.
 */
import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

const EXTENSION_NAME = "Comfy.RememberMe_Allergic.Enhanced";
const NODE_TYPE_NAME = "RememberMe_Allergic";

// Colors for different states
const NORMAL_COLOR = "#dddddd";
const CHANGED_COLOR = "#ff4444";  // Red for when environment changed
const STABLE_COLOR = "#66ff99";   // Green for stable environment

// Size constraints
const MIN_NODE_WIDTH = 380;   // Minimum width for button and text display
const MIN_NODE_HEIGHT = 480;  // Minimum height for both widgets and button

/**
 * Apply a consistent read-only monospace style to a textarea element.
 * @param {HTMLTextAreaElement} el - The textarea to style
 */
function applyBaseTextareaStyle(el) {
    el.readOnly = true;
    el.style.fontFamily = "monospace";
    el.style.fontSize = "12px";
    el.style.backgroundColor = "var(--comfy-input-bg, #333)";
    el.style.color = NORMAL_COLOR;
    el.style.border = "2px solid #555";
    el.style.borderRadius = "4px";
    el.style.padding = "12px";
    el.style.lineHeight = "1.4";
    el.style.whiteSpace = "pre";
    el.style.transition = "border-color 0.3s ease, background-color 0.3s ease";
}

/**
 * Apply color styling to a textarea based on environment state.
 * @param {HTMLTextAreaElement} el - The textarea to style
 * @param {"changed"|"stable"} state - The environment state
 * @param {boolean} [pulse=false] - Whether to add a temporary pulse effect
 */
function applyStateStyle(el, state, pulse = false) {
    if (state === "changed") {
        el.style.borderColor = CHANGED_COLOR;
        el.style.backgroundColor = "rgba(255, 68, 68, 0.1)";
        el.style.color = CHANGED_COLOR;
        if (pulse) {
            el.style.boxShadow = `0 0 10px ${CHANGED_COLOR}`;
            setTimeout(() => { el.style.boxShadow = "none"; }, 2000);
        }
    } else {
        el.style.borderColor = "#666";
        el.style.backgroundColor = "rgba(102, 255, 153, 0.05)";
        el.style.color = STABLE_COLOR;
    }
}

/**
 * Extract the "Captured: ..." timestamp string from a snapshot or widget value.
 * @param {string} text - The snapshot text
 * @returns {string|null} The timestamp portion (e.g. "2024-06-15 14:30:00") or null
 */
function extractTimestamp(text) {
    if (!text) return null;
    const match = text.match(/Captured:\s*(.+)/);
    return match ? match[1].trim() : null;
}

/**
 * Compute a human-readable diff between two comparison keys (snapshots without timestamps).
 * Returns an array of strings describing each difference.
 * @param {string} oldKey - Previous comparison key
 * @param {string} newKey - Current comparison key
 * @returns {string[]} Lines describing differences
 */
function computeDiffLines(oldKey, newKey) {
    const oldLines = oldKey.split('\n').filter(l => l.trim() !== '');
    const newLines = newKey.split('\n').filter(l => l.trim() !== '');

    // Build maps of "label: value" for structured comparison
    const oldMap = new Map();
    const newMap = new Map();

    for (const line of oldLines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
            const key = line.substring(0, colonIdx).trim();
            const val = line.substring(colonIdx + 1).trim();
            oldMap.set(key, val);
        } else {
            // Lines without colons (like section headers) keyed by content
            oldMap.set(line.trim(), "");
        }
    }
    for (const line of newLines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
            const key = line.substring(0, colonIdx).trim();
            const val = line.substring(colonIdx + 1).trim();
            newMap.set(key, val);
        } else {
            newMap.set(line.trim(), "");
        }
    }

    const diffs = [];

    // Check for changed or removed entries
    for (const [key, oldVal] of oldMap) {
        const newVal = newMap.get(key);
        if (newVal === undefined) {
            diffs.push(`- ${key}: ${oldVal}`.trimEnd());
        } else if (newVal !== oldVal) {
            diffs.push(`  ${key}:`);
            diffs.push(`    was: ${oldVal}`);
            diffs.push(`    now: ${newVal}`);
        }
    }

    // Check for newly added entries
    for (const [key, newVal] of newMap) {
        if (!oldMap.has(key)) {
            diffs.push(`+ ${key}: ${newVal}`.trimEnd());
        }
    }

    return diffs;
}

const RememberMeExtension = {
    name: EXTENSION_NAME,

    // Store last known environment for comparison
    lastEnvironment: null,

    /**
     * Create (or return existing) the main environment display widget.
     */
    createDisplayWidget: function(nodeInstance) {
        const widgetName = "environment_display";

        if (nodeInstance.widgets && nodeInstance.widgets.find(w => w.name === widgetName)) {
            return nodeInstance.widgets.find(w => w.name === widgetName);
        }

        const widget = ComfyWidgets.STRING(nodeInstance, widgetName, ["STRING", {
            multiline: true,
            default: "Click 'Populate Environment Info' button to collect\ndata for initial run.\n\nOtherwise first run just populates node data.\nSubsequent runs populate, compare and are saved\nto metadata.",
            serialize: false
        }], app).widget;

        applyBaseTextareaStyle(widget.inputEl);
        widget.inputEl.rows = 12;
        widget.inputEl.style.minHeight = "200px";

        return widget;
    },

    /**
     * Create (or return existing) the diff display widget that shows
     * only the differences between the previous and current run.
     */
    createDiffWidget: function(nodeInstance) {
        const widgetName = "diff_display";

        if (nodeInstance.widgets && nodeInstance.widgets.find(w => w.name === widgetName)) {
            return nodeInstance.widgets.find(w => w.name === widgetName);
        }

        const widget = ComfyWidgets.STRING(nodeInstance, widgetName, ["STRING", {
            multiline: true,
            default: "",
            serialize: false
        }], app).widget;

        applyBaseTextareaStyle(widget.inputEl);
        widget.inputEl.rows = 6;
        widget.inputEl.style.minHeight = "80px";
        // Start with text hidden — color reveals on STABLE/CHANGED
        widget.inputEl.style.color = "transparent";

        return widget;
    },

    extractComparisonKey: function(value) {
        if (!value || typeof value !== 'string'
            || value.includes("Environment info will appear here")
            || value.includes("Populate Environment Info")) {
            return null;
        }

        // Remove status prefix if present
        const cleanValue = value.replace(/^\[(FIRST RUN|CHANGED|STABLE|POPULATED)\] /, '');
        // Remove timestamp line for comparison
        const lines = cleanValue.split('\n');
        return lines.filter(line => !line.startsWith('Captured:')).join('\n');
    },

    updateDisplay: function(nodeInstance, payload) {
        // Ensure both widgets exist
        let displayWidget = nodeInstance.environmentWidget;
        if (!displayWidget) {
            displayWidget = RememberMeExtension.createDisplayWidget(nodeInstance);
            nodeInstance.environmentWidget = displayWidget;
        }

        let diffWidget = nodeInstance.diffWidget;
        if (!diffWidget) {
            diffWidget = RememberMeExtension.createDiffWidget(nodeInstance);
            nodeInstance.diffWidget = diffWidget;
        }

        if (!displayWidget || !displayWidget.inputEl || !payload) {
            return;
        }

        const { current_snapshot, comparison_key } = payload;

        // Grab the previous timestamp before we overwrite anything
        const previousTimestamp = nodeInstance._previousTimestamp || null;

        // Check if there's existing data in the widget (from loaded workflow/metadata)
        const existingValue = displayWidget.value;
        const previousComparisonKey = this.extractComparisonKey(existingValue);

        // Also check if we have a stored comparison key on the node instance itself
        const storedComparisonKey = nodeInstance._storedComparisonKey || previousComparisonKey;

        // Determine state — first run defaults to "stable" (baseline established)
        const isFirstRun = !storedComparisonKey && !this.lastEnvironment;
        const hasChanged = !isFirstRun && storedComparisonKey && storedComparisonKey !== comparison_key;
        const stateKey = hasChanged ? "changed" : "stable";

        // Save the current timestamp as "previous" for next run
        const currentTimestamp = extractTimestamp(current_snapshot);
        nodeInstance._previousTimestamp = currentTimestamp;

        // Always store the comparison key so subsequent runs compare against this one
        nodeInstance._storedComparisonKey = comparison_key;

        // --- Main display widget (neutral colors, just the info) ---
        displayWidget.inputEl.style.borderColor = "#555";
        displayWidget.inputEl.style.backgroundColor = "var(--comfy-input-bg, #333)";
        displayWidget.inputEl.style.color = NORMAL_COLOR;

        if (stateKey === "changed") {
            console.log("[RememberMe] Environment change detected!");
            console.log("[RememberMe] Previous:", storedComparisonKey?.substring(0, 100) + "...");
            console.log("[RememberMe] Current:", comparison_key?.substring(0, 100) + "...");
        }

        // Store current environment for next comparison
        this.lastEnvironment = comparison_key;

        displayWidget.value = current_snapshot;

        // --- Diff widget ---
        if (diffWidget && diffWidget.inputEl) {
            if (hasChanged) {
                const diffLines = computeDiffLines(storedComparisonKey, comparison_key);
                const header = previousTimestamp
                    ? `Compared to: ${previousTimestamp}`
                    : "Compared to: previous run";
                diffWidget.value = `[CHANGED] ${header}\n\n${diffLines.join('\n')}`;
                applyStateStyle(diffWidget.inputEl, "changed", true);
            } else {
                const header = previousTimestamp
                    ? `Compared to: ${previousTimestamp}`
                    : "Compared to: previous run";
                diffWidget.value = `[STABLE] ${header}\n\nNo differences detected.`;
                applyStateStyle(diffWidget.inputEl, "stable");
            }
        }
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
                // Note: diff widget is created after the button (added in onAdded)

                // Immediately extract and store comparison key from existing widget data
                const displayWidget = this.environmentWidget;
                if (displayWidget && displayWidget.value) {
                    const comparisonKey = RememberMeExtension.extractComparisonKey(displayWidget.value);
                    if (comparisonKey) {
                        this._storedComparisonKey = comparisonKey;
                        RememberMeExtension.lastEnvironment = comparisonKey;
                        console.log("[RememberMe] Loaded existing environment data from workflow");
                    }
                    // Also extract the timestamp from the stored snapshot
                    const ts = extractTimestamp(displayWidget.value);
                    if (ts) {
                        this._previousTimestamp = ts;
                    }
                }

                this.computeSize();
                this.setDirtyCanvas(true, false);
            };

            const originalOnAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function() {
                originalOnAdded?.apply(this, arguments);
                RememberMeExtension.createDisplayWidget(this);

                // Add the populate environment button (between the two widgets)
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
                            const response = await fetch('/allergic/remember_me/populate', {
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

                            if (displayWidget?.inputEl) {
                                displayWidget.value = "Collecting environment info... (running workflow as fallback)";
                            }

                            app.queuePrompt(0, 1, {
                                [this.id]: {
                                    inputs: { populate_env: true },
                                    class_type: NODE_TYPE_NAME
                                }
                            });
                        }
                    }
                );

                // Diff widget goes after the button
                RememberMeExtension.createDiffWidget(this);

                // Set a larger default size to accommodate both widgets and button
                const currentSize = this.computeSize();
                this.setSize([
                    Math.max(currentSize[0], Math.max(400, MIN_NODE_WIDTH)),
                    Math.max(currentSize[1], Math.max(480, MIN_NODE_HEIGHT))
                ]);
            };

            // Override onResize to enforce minimum size constraints
            const originalOnResize = nodeType.prototype.onResize;
            nodeType.prototype.onResize = function(size) {
                const constrainedSize = [
                    Math.max(size[0], MIN_NODE_WIDTH),
                    Math.max(size[1], MIN_NODE_HEIGHT)
                ];

                if (originalOnResize) {
                    originalOnResize.call(this, constrainedSize);
                } else {
                    this.size = constrainedSize;
                }

                return constrainedSize;
            };

            // Override serialize to persist comparison key and previous timestamp
            const originalSerialize = nodeType.prototype.serialize;
            nodeType.prototype.serialize = function() {
                const data = originalSerialize ? originalSerialize.apply(this, arguments) : {};

                if (this._storedComparisonKey) {
                    data._storedComparisonKey = this._storedComparisonKey;
                }
                if (this._previousTimestamp) {
                    data._previousTimestamp = this._previousTimestamp;
                }

                return data;
            };

            // Override configure to restore comparison key and previous timestamp
            const originalConfigure = nodeType.prototype.configure;
            nodeType.prototype.configure = function(data) {
                if (originalConfigure) {
                    originalConfigure.apply(this, arguments);
                }

                if (data._storedComparisonKey) {
                    this._storedComparisonKey = data._storedComparisonKey;
                }
                if (data._previousTimestamp) {
                    this._previousTimestamp = data._previousTimestamp;
                }
            };
        }
    }
};

app.registerExtension(RememberMeExtension);
console.log(`[${EXTENSION_NAME}] Extension registered with diff display and environment change detection.`);
