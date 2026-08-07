# Using Python runtime inside container
FROM python:3.14-slim

# Set working directory inside container
WORKDIR /offchain/backend

# Copy requirement dependencies
COPY requirements.txt .

# Install Dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port the application will run on
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]