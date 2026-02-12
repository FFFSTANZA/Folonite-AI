# Folonite Helm Charts

This directory contains Helm charts for deploying Folonite on Kubernetes.

## Documentation

For complete deployment instructions, see:
**[Helm Deployment Guide](https://docs.folonite.ai/deployment/helm)**

## Quick Start

```bash
# Clone repository
git clone https://github.com/folonite-ai/folonite.git
cd folonite

# Create values.yaml with your API key(s)
cat > values.yaml <<EOF
folonite-agent:
  apiKeys:
    anthropic:
      value: "sk-ant-your-key-here"
EOF

# Install
helm install folonite ./helm --namespace folonite --create-namespace -f values.yaml

# Access
kubectl port-forward -n folonite svc/folonite-ui 9992:9992
```

Access at: http://localhost:9992

## Structure

```
helm/
├── Chart.yaml              # Main chart
├── values.yaml             # Default values
├── values-proxy.yaml       # LiteLLM proxy configuration
├── templates/              # Kubernetes templates
└── charts/                 # Subcharts
    ├── folonite-desktop/    # Desktop VNC service
    ├── folonite-agent/      # Backend API service
    ├── folonite-ui/         # Frontend UI service
    ├── folonite-llm-proxy/  # Optional LiteLLM proxy
    └── postgresql/         # PostgreSQL database
```