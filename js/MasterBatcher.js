import { app } from "../../../scripts/app.js";

app.registerExtension({
	name: "AllergicPack.MasterBatcher",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "MasterBatcher_Allergic") {

			const onNodeCreated = nodeType.prototype.onNodeCreated;

			nodeType.prototype.onNodeCreated = function () {
				onNodeCreated?.apply(this, arguments);

				const node = this;

				// Flag to track if this node is being loaded from a workflow
				node._isFromWorkflow = false;

				// --- Reset Batch button ---
				this.addWidget(
					"button", "Reset Batch", "reset_batch_button",
					() => {
						const batchWidget = node.widgets.find((w) => w.name === "batch_index");
						const resetWidget = node.widgets.find((w) => w.name === "reset_batch_to");
						if (batchWidget && resetWidget) {
							batchWidget.value = resetWidget.value;
						}
					}
				);

				// --- Calculate Batches button ---
				this.addWidget(
					"button", "Calculate Batches", "calculate_batches_button",
					async () => {
						const folderPathsWidget = node.widgets.find((w) => w.name === "folder_paths");
						const batchSizeWidget = node.widgets.find((w) => w.name === "batch_size");
						const sortMethodWidget = node.widgets.find((w) => w.name === "sort_method");

						if (!folderPathsWidget || !batchSizeWidget || !sortMethodWidget) return;

						try {
							const response = await fetch("/allergic/master_batcher/calculate", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									folder_paths: folderPathsWidget.value,
									batch_size: batchSizeWidget.value,
									sort_method: sortMethodWidget.value,
								}),
							});

							if (response.ok) {
								const result = await response.json();
								if (result.success) {
									// Update total_batches output slot (index 4)
									node._updateSlotName(4, "total_batches: " + result.total_batches);
									node.setDirtyCanvas(true, false);
									console.log("[MasterBatcher] Calculate result:", result);
								}
							}
						} catch (error) {
							console.warn("[MasterBatcher] Calculate failed:", error);
						}
					}
				);

				// Set control_after_generate to "increment" for new nodes
				setTimeout(() => {
					const batchWidget = node.widgets.find((w) => w.name === "batch_index");

					if (batchWidget && batchWidget.linkedWidgets) {
						const controlWidget = batchWidget.linkedWidgets.find((w) => w.type === "combo");
						if (controlWidget && !node._isFromWorkflow) {
							const setIncrement = () => {
								if (controlWidget.value === "randomize" || controlWidget.value === "fixed" || !controlWidget.value) {
									controlWidget.value = "increment";
								}
							};

							setIncrement();
							setTimeout(setIncrement, 50);
							setTimeout(setIncrement, 200);
						}
					}
				}, 100);
			};

			// --- Helper to update an output slot name by index ---
			nodeType.prototype._updateSlotName = function (index, newName) {
				if (this.outputs && this.outputs[index]) {
					const slot = this.outputs[index];
					slot.name = newName;
					slot.label = newName;
					if (slot.hasOwnProperty("localized_name")) {
						slot.localized_name = newName;
					}
				}
			};

			// --- onExecuted: update output slot names with live data ---
			const onExecutedOriginal = nodeType.prototype.onExecuted;
			nodeType.prototype.onExecuted = function (message) {
				onExecutedOriginal?.apply(this, arguments);

				if (!message?.batch_info || !Array.isArray(message.batch_info) || message.batch_info.length === 0) {
					return;
				}

				const info = message.batch_info[0];
				const { images_loaded, folder_path, total_batches, batch_index } = info;

				// Output slot indices: 0=images, 1=masks, 2=images_loaded, 3=folder_path, 4=total_batches
				if (this.outputs && this.outputs.length >= 5) {
					// images_loaded slot (index 2)
					const batchLabel = total_batches > 0 && batch_index < total_batches
						? "images_loaded: " + images_loaded + " (batch " + (batch_index + 1) + "/" + total_batches + ")"
						: "images_loaded: " + images_loaded + " (DONE)";
					this._updateSlotName(2, batchLabel);

					// folder_path slot (index 3) - show just the folder name
					let folderName = folder_path || "";
					if (folderName && folderName !== "DONE" && folderName !== "EMPTY") {
						const parts = folderName.replace(/\\/g, "/").split("/");
						folderName = parts[parts.length - 1] || folderName;
					}
					this._updateSlotName(3, "folder_path: " + folderName);

					// total_batches slot (index 4)
					this._updateSlotName(4, "total_batches: " + total_batches);

					this.setDirtyCanvas(true, false);
				}
			};

			// --- configure: detect workflow loads to preserve saved settings ---
			const originalConfigure = nodeType.prototype.configure;
			nodeType.prototype.configure = function (info) {
				this._isFromWorkflow = true;

				if (originalConfigure) {
					originalConfigure.call(this, info);
				}
			};
		}
	},
});
