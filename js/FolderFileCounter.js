import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "AllergicPack.FolderFileCounter", 
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name === "FolderFileCounter_Allergic") { // Matches NODE_CLASS_MAPPINGS key

            // --- Hook to set initial minimal node size ---
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                onNodeCreated?.apply(this, arguments);
                
                // Set initial minimal node size (but allow user to resize)
                this.size = [Math.max(this.size[0], 200), Math.max(this.size[1], 80)]; // [width, height]
                
                // Find the folder_path widget and set initial minimal size
                const folderPathWidget = this.widgets?.find(w => w.name === "folder_path");
                if (folderPathWidget && folderPathWidget.inputEl) {
                    // Set initial minimal size but preserve default ComfyUI widget behavior
                    folderPathWidget.inputEl.style.minHeight = "25px";
                    folderPathWidget.inputEl.rows = 1; // Start with 1 row
                    // Don't override computeSize to maintain default widget-to-node coupling
                }
                
                // Force node to recalculate its size
                this.setDirtyCanvas(true, true);
            };

            // --- Hook for when node is added to graph ---
            const onAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function(graph) {
                onAdded?.apply(this, arguments);
                
                // Set initial minimal size after node is added
                setTimeout(() => {
                    // Set initial compact size but don't limit maximum
                    if (this.size[1] > 100) {
                        this.size[1] = 100; // Start compact, but user can resize larger
                    }
                    
                    // Set initial minimal widget size (preserving default behavior)
                    const folderPathWidget = this.widgets?.find(w => w.name === "folder_path");
                    if (folderPathWidget && folderPathWidget.inputEl) {
                        folderPathWidget.inputEl.style.minHeight = "25px";
                        folderPathWidget.inputEl.rows = 1;
                        // Remove independent resize - let it follow node size as default
                    }
                    
                    this.setDirtyCanvas(true, true);
                }, 50);
            };

            // --- Hook to update output slot name when node is executed ---
            const onExecutedOriginal = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                onExecutedOriginal?.apply(this, arguments);

                const fileCountOutputSlotIndex = 1; 
                const originalStaticName = "file_count"; 

                if (this.outputs && this.outputs.length > fileCountOutputSlotIndex) {
                    const outputSlot = this.outputs[fileCountOutputSlotIndex];

                    if (message && message.value && message.value.length > 0) {
                        const fileCount = message.value[0];
                        const newDynamicName = `${originalStaticName}: ${fileCount}`;
                        
                        if (outputSlot.name !== newDynamicName || outputSlot.label !== newDynamicName || (outputSlot.hasOwnProperty('localized_name') && outputSlot.localized_name !== newDynamicName)) {
                            outputSlot.name = newDynamicName;
                            outputSlot.label = newDynamicName; 
                            if (outputSlot.hasOwnProperty('localized_name')) {
                                outputSlot.localized_name = newDynamicName;
                            }
                            this.setDirtyCanvas(true, false); 
                        }
                    } else {
                        // Revert to original static name if no count is available or on error
                        if (outputSlot.name !== originalStaticName || outputSlot.label !== originalStaticName || (outputSlot.hasOwnProperty('localized_name') && outputSlot.localized_name !== originalStaticName) ) {
                            outputSlot.name = originalStaticName;
                            outputSlot.label = originalStaticName;
                            if (outputSlot.hasOwnProperty('localized_name')) {
                                outputSlot.localized_name = originalStaticName;
                            }
                            this.setDirtyCanvas(true, false);
                        }
                    }
                }
            };

            // --- Ensure onDrawForeground does no custom drawing of the number ---
            const onDrawForegroundOriginal = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function (ctx) {
                onDrawForegroundOriginal?.apply?.(this, arguments);
            };
        }
    },
});