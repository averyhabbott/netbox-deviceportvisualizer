#!/bin/bash

echo "Checking to see if config.js exists..."
if [ ! -f "../config.js" ]; then
  echo "config.js does not exist. Creating a new one..."
  cp config.js.example ../config.js
else
  echo "config.js already exists. Skipping creation."
fi

echo "Checking to see if models directory exists..."
if [ ! -d "../models" ]; then
  echo "models directory does not exist. Creating a new one..."
  mkdir ../models
else
  echo "models directory already exists. Skipping creation."
fi

# This script will invoke Python with the value of the PYTHON environment
# variable (if set), or fall back to "python3".

VIRTUALENV="$(pwd -P)/../venv"
PYTHON="${PYTHON:-python3}"

# Remove the existing virtual environment (if any)
if [ -d "$VIRTUALENV" ]; then
  COMMAND="rm -rf \"${VIRTUALENV}\""
  echo "Removing old virtual environment..."
  eval $COMMAND
else
  WARN_MISSING_VENV=1
fi

# Create a new virtual environment
COMMAND="${PYTHON} -m venv \"${VIRTUALENV}\""
echo "Creating a new virtual environment at ${VIRTUALENV}..."
eval $COMMAND || {
  echo "--------------------------------------------------------------------"
  echo "ERROR: Failed to create the virtual environment. Check that you have"
  echo "the required system packages installed and the following path is"
  echo "writable: ${VIRTUALENV}"
  echo "--------------------------------------------------------------------"
  exit 1
}

# Activate the virtual environment
COMMAND="source $VIRTUALENV/bin/activate"
echo "Activating venv ($COMMAND)..."
eval $COMMAND || exit 1

# Upgrade pip
COMMAND="pip install --upgrade pip"
echo "Updating pip ($COMMAND)..."
eval $COMMAND || exit 1
$VIRTUALENV/bin/pip -V

# Install necessary system packages
COMMAND="pip install wheel"
echo "Installing Python system packages ($COMMAND)..."
eval $COMMAND || exit 1

# Install required Python packages
COMMAND="pip install -r requirements.txt"
echo "Installing core dependencies ($COMMAND)..."
eval $COMMAND || exit 1

# Install optional packages (if any)
if [ -s "local_requirements.txt" ]; then
  COMMAND="pip install -r local_requirements.txt"
  echo "Installing local dependencies ($COMMAND)..."
  eval $COMMAND || exit 1
elif [ -f "local_requirements.txt" ]; then
  echo "Skipping local dependencies (local_requirements.txt is empty)"
else
  echo "Skipping local dependencies (local_requirements.txt not found)"
fi
