# Extend the pre-built folonite-desktop image
FROM ghcr.io/folonite-ai/folonite-desktop:edge

# Add additional packages, applications, or customizations here

# Expose the folonited service port
EXPOSE 9990

# Start the folonited service
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf", "-n"]
