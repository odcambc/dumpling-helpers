FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# System utilities used by init-firewall.sh and general dev work.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        iptables \
        ipset \
        dnsutils \
        jq \
        sudo \
    && rm -rf /var/lib/apt/lists/*

# Allow the unprivileged dev user to run iptables/ipset for the egress firewall
# without a password (the postStartCommand calls these).
RUN echo 'vscode ALL=(root) NOPASSWD: /usr/sbin/iptables, /usr/sbin/ipset' \
        > /etc/sudoers.d/devcontainer-firewall \
    && chmod 0440 /etc/sudoers.d/devcontainer-firewall

# Node.js 22 (matches Vite 8 / React 19 expectations).
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Python 3.13 + uv for the FastAPI backend.
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get install -y --no-install-recommends \
        python3.13 \
        python3.13-venv \
    && rm -rf /var/lib/apt/lists/*

USER vscode
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/home/vscode/.local/bin:${PATH}"
