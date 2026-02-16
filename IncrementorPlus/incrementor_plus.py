class IncrementorPlus:
    """Integer counter with configurable step size and reset."""

    NODE_NAME = "IncrementorPlus"
    DISPLAY_NAME = "Incrementor Plus (Allergic)"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("INT", {
                    "default": 0,
                    "step": 1,
                    # This enables the control after generate dropdown
                    "control_after_generate": "increment", 
                }),
                "step_size": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 100,
                    "step": 1
                }),
                "reset_value_to": ("INT", {"default": 0}),
            }
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("value", "step_size")
    FUNCTION = "execute"
    CATEGORY = "Allergic Pack"

    def execute(self, value: int, step_size: int, reset_value_to: int):
        """Return current value and step size. reset_value_to is used by the JS frontend only."""
        return (value, step_size)

NODE_CLASS_MAPPINGS = {IncrementorPlus.NODE_NAME: IncrementorPlus}
NODE_DISPLAY_NAME_MAPPINGS = {IncrementorPlus.NODE_NAME: IncrementorPlus.DISPLAY_NAME}