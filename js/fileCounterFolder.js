import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "AllergicPack.FileCounterFolder", 
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name === "FileCounter_Folder_Allergic") { // Matches NODE_CLASS_MAPPINGS key

            // --- REMOVED: Custom onAdded hook for marginTop and node resizing ---
            // We will now rely on LiteGraph's default widget positioning and node sizing.

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
            // (It's good practice to ensure it calls the original if one existed, 
            // even if we're not adding custom drawing here.)
            const onDrawForegroundOriginal = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function (ctx) {
                onDrawForegroundOriginal?.apply?.(this, arguments);
            };
        }
    },
});