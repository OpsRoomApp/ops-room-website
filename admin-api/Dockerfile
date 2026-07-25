FROM python:3.12-alpine

WORKDIR /app

# Install only what we need
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run with uvicorn
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
