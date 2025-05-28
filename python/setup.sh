#!/bin/bash

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip first
pip install --upgrade pip

# Install setuptools and wheel first
pip install setuptools wheel

# Install requirements
pip install -r requirements.txt

# Deactivate virtual environment
deactivate 