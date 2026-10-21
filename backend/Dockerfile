# ---------- Stage 1: Builder ----------
FROM python:3.11-slim AS builder

WORKDIR /build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Create an isolated environment for dependencies
RUN python -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt


# ---------- Stage 2: Runtime ----------
FROM python:3.11-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# Copy only the virtual environment from the builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY . .

# Run as a non-root user
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
