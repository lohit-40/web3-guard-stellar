FROM python:3.11-slim

WORKDIR /app/backend

# Copy the backend code
COPY backend/ /app/backend/

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Use the existing Procfile command to start the server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
