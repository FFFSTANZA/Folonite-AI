FROM ghcr.io/berriai/litellm:main-stable

# Add custom config into the image
COPY ./folonite-llm-proxy/litellm-config.yaml /app/config.yaml

CMD ["--config", "/app/config.yaml", "--port", "4000"]