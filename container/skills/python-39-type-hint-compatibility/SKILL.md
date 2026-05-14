---
name: python-39-type-hint-compatibility
description: |
  Fix "TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'" errors
  in Python 3.9 environments. Use when: (1) Code works locally with Python 3.10+ but
  fails in production/CI with Python 3.9, (2) Error occurs at import/module load time
  with union type annotations, (3) Home Assistant custom components fail with "Unknown
  error" during setup. Covers migration from Python 3.10+ union syntax (X | Y) to
  Python 3.9-compatible Optional[X] and Union[X, Y] from typing module.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# Python 3.9 Type Hint Compatibility Fix

## Problem
Code using Python 3.10+ union type syntax (`type | None` or `X | Y`) fails in Python 3.9
environments with `TypeError: unsupported operand type(s) for |` at import time, causing
complete module load failures and generic error messages in applications.

## Context / Trigger Conditions

**Exact Error Message:**
```
TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'
```

**When This Occurs:**
- Code developed/tested with Python 3.10+ deployed to Python 3.9 environment
- Error happens at module import time (not runtime)
- Home Assistant custom components show "Unknown error occurred" during config flow
- pytest fails immediately on test file import
- Application fails to start with traceback pointing to type annotations

**Common Scenarios:**
- Home Assistant running Python 3.9 (HA Core < 2024.x)
- CI/CD pipelines with older Python versions
- Docker images with Python 3.9 base
- Shared libraries supporting multiple Python versions

## Solution

### Step 1: Identify Python Version Requirements

Check the target environment's Python version:
- **Home Assistant**: Check `manifest.json` or HA Core documentation
- **General**: Check `python --version` in deployment environment
- **CI/CD**: Review workflow/pipeline Python version matrix

### Step 2: Locate All Union Type Syntax Usage

Search for the problematic pattern:
```bash
# Find all files with union syntax
grep -r " | None" --include="*.py" .
grep -r ": [A-Za-z_]* | " --include="*.py" .
```

Common patterns to find:
- `def func(param: str | None)`
- `variable: dict[str, Any] | None`
- `-> list[str] | None:`
- `self._attr: int | None = None`

### Step 3: Convert to Python 3.9-Compatible Syntax

Replace union operators with `typing.Optional` or `typing.Union`:

**Before (Python 3.10+):**
```python
from typing import Any

def get_data(
    user_id: str,
    options: dict[str, Any] | None = None,
) -> list[dict[str, str]] | None:
    cached: str | None = None
    return result
```

**After (Python 3.9-compatible):**
```python
from typing import Any, Optional

def get_data(
    user_id: str,
    options: Optional[dict[str, Any]] = None,
) -> Optional[list[dict[str, str]]]:
    cached: Optional[str] = None
    return result
```

**For Multiple Types (not just None):**
```python
# Before
def process(value: int | str | float) -> bool:
    pass

# After
from typing import Union

def process(value: Union[int, str, float]) -> bool:
    pass
```

### Step 4: Update Import Statements

Ensure `Optional` is imported from `typing`:
```python
# Add to existing typing imports
from typing import Any, Dict, List, Optional

# Or add Union for multi-type unions
from typing import Any, Dict, List, Optional, Union
```

### Step 5: Systematic Replacement Pattern

Use search-and-replace with these patterns:

1. **Simple None unions:**
   - Find: `: ([A-Za-z_\[\],\s]+) \| None`
   - Replace: `: Optional[$1]`

2. **Return type None unions:**
   - Find: `-> ([A-Za-z_\[\],\s]+) \| None:`
   - Replace: `-> Optional[$1]:`

3. **Variable annotations:**
   - Find: `self\.([a-z_]+): ([A-Za-z_\[\]]+) \| None`
   - Replace: `self.$1: Optional[$2]`

**Note:** Regex patterns need adjustment for your specific IDE/editor.

### Step 6: Verify All Occurrences Fixed

```bash
# Verify no union operators remain in type hints
grep -n " | " --include="*.py" . | grep -v "# "

# Check Python can import the modules
python3.9 -c "import your_module"
```

## Verification

### Import Test
```python
# Create test_imports.py
import sys
print(f"Python version: {sys.version}")

# Import all your modules
from your_package import module1, module2, module3
print("All imports successful!")
```

Run with Python 3.9:
```bash
python3.9 test_imports.py
```

### Type Checker Validation
```bash
# Install mypy for Python 3.9
mypy --python-version 3.9 your_package/
```

### Home Assistant Specific
1. Restart Home Assistant
2. Navigate to Settings → Devices & Services → Add Integration
3. Search for your integration
4. Complete config flow - should not show "Unknown error occurred"
5. Check Home Assistant logs for any remaining Python errors

## Example: Real-World Fix

**File:** `custom_components/israel_transportation/config_flow.py`

**Before (31 occurrences across 6 files):**
```python
class ConfigFlow(config_entries.ConfigFlow):
    def __init__(self) -> None:
        self._station_id: str | None = None
        self._station_name: str | None = None
        self._selected_city: str | None = None

    async def async_step_select_city(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        # Implementation
```

**After:**
```python
from typing import Optional

class ConfigFlow(config_entries.ConfigFlow):
    def __init__(self) -> None:
        self._station_id: Optional[str] = None
        self._station_name: Optional[str] = None
        self._selected_city: Optional[str] = None

    async def async_step_select_city(
        self, user_input: Optional[dict[str, Any]] = None
    ) -> FlowResult:
        # Implementation
```

**Files Modified in Real Case:**
- `config_flow.py`: 11 replacements
- `coordinator.py`: 11 replacements
- `api.py`: 3 replacements
- `gov_api.py`: 2 replacements
- `sensor.py`: 2 replacements
- `gtfs_loader.py`: 2 replacements

## Alternative: Future Annotations (Advanced)

For codebases that want to use modern syntax but support Python 3.9:

```python
from __future__ import annotations
from typing import Optional  # Still needed for runtime type checking

def func(param: str | None = None) -> list[str] | None:
    """Modern syntax works with __future__ import"""
    pass
```

**Caveats:**
- Breaks runtime type inspection (e.g., `get_type_hints()`)
- May cause issues with Pydantic, FastAPI, and other libraries
- Not recommended for Home Assistant integrations
- Only use if you understand the implications

## Notes

### Why This Happens
- Python 3.10 introduced PEP 604 union syntax (`X | Y`)
- The `|` operator for types wasn't available in Python 3.9
- Error occurs at parse/import time, not runtime
- Generic error messages often hide the true cause

### Version Compatibility Matrix
- Python 3.10+: Both `X | Y` and `Optional[X]` work
- Python 3.9: Only `Optional[X]` and `Union[X, Y]` work
- Python 3.7-3.8: Same as 3.9, use `typing` module

### Home Assistant Specifics
- HA Core 2024.1+ requires Python 3.11+
- HA Core 2023.x uses Python 3.10
- HA Core 2022.x and earlier use Python 3.9
- Always check `manifest.json` for `requirements` Python version

### Testing Across Versions
```bash
# Use tox for multi-version testing
# tox.ini
[tox]
envlist = py39,py310,py311

[testenv]
deps = pytest
commands = pytest tests/
```

### Performance Impact
None - `Optional[X]` and `X | None` are equivalent at runtime, just different
syntax for the same type annotation.

## References
- [Python 3.10 What's New - Union Types](https://docs.python.org/3/whatsnew/3.10.html)
- [typing Module Documentation](https://docs.python.org/3/library/typing.html)
- [PEP 604 - Union Operators](https://peps.python.org/pep-0604/)
- [Python Type Hints Old and New Syntaxes](https://adamj.eu/tech/2022/10/17/python-type-hints-old-and-new-syntaxes/)
- [Home Assistant Developer Documentation](https://developers.home-assistant.io/)
