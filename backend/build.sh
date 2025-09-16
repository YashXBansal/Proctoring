#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

# This command forces matplotlib to build the font cache during the build
# so the application starts much faster.
python -c "import matplotlib.font_manager"