import { app } from "../../../scripts/app.js";
import { updateSlotName } from "./allergic_utils.js";

app.registerExtension({
    name: "AllergicPack.FolderFileCounter",
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name === "FolderFileCounter_Allergic") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const result = onNodeCreated?.apply(this, arguments);

                this.size = [Math.max(this.size[0], 200), Math.max(this.size[1], 80)];

                const folderPathWidget = this.widgets?.find(w => w.name === "folder_path");
                if (folderPathWidget && folderPathWidget.inputEl) {
                    folderPathWidget.inputEl.style.minHeight = "25px";
                    folderPathWidget.inputEl.rows = 1;
                }

                // --- Select All button ---
                this.addWidget(
                    "button", "Select All Text", "select_all_button",
                    () => {
                        const fpWidget = this.widgets.find((w) => w.name === "folder_path");
                        if (fpWidget && fpWidget.inputEl) {
                            fpWidget.inputEl.focus();
                            fpWidget.inputEl.select();
                        }
                    }
                );

                // --- Get File Count button ---
                this.addWidget(
                    "button", "Get File Count", "get_file_count_button",
                    async () => {
                        const fpWidget = this.widgets.find((w) => w.name === "folder_path");
                        const folderPath = fpWidget?.value || "";
                        try {
                            const resp = await fetch("/allergic/folder_file_count", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ folder_path: folderPath }),
                            });
                            const data = await resp.json();
                            const count = data.file_count ?? 0;
                            updateSlotName(this, 1, "file_count: " + count);
                            this.setDirtyCanvas(true, false);
                        } catch (e) {
                            console.error("Get File Count failed:", e);
                        }
                    }
                );

                this.setDirtyCanvas(true, true);
                return result;
            };

            // --- Set compact size after node is added to graph ---
            const onAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function(graph) {
                onAdded?.apply(this, arguments);

                setTimeout(() => {
                    if (this.size[1] > 130) {
                        this.size[1] = 130;
                    }

                    const folderPathWidget = this.widgets?.find(w => w.name === "folder_path");
                    if (folderPathWidget && folderPathWidget.inputEl) {
                        folderPathWidget.inputEl.style.minHeight = "25px";
                        folderPathWidget.inputEl.rows = 1;
                    }

                    this.setDirtyCanvas(true, true);
                }, 50);
            };

            // --- Update output slot name on execution ---
            const onExecutedOriginal = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                onExecutedOriginal?.apply(this, arguments);

                const slotIndex = 1;
                const baseName = "file_count";

                if (message && message.value && message.value.length > 0) {
                    updateSlotName(this, slotIndex, baseName + ": " + message.value[0]);
                } else {
                    updateSlotName(this, slotIndex, baseName);
                }
                this.setDirtyCanvas(true, false);
            };
        }
    },
});
