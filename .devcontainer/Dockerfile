FROM python:3.13-slim-bookworm

# System tools — curl/git for installs, ipset/iptables for the egress firewall,
# sudo so the non-root user can run the firewall script at container start.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    gnupg \
    ipset \
    iptables \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# uv — installed to /root first; we'll expose it system-wide below.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN uv --version

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Non-root user for day-to-day work. Passwordless sudo is needed so the
# postStartCommand can run iptables/ipset to set up the egress firewall.
ARG USERNAME=claude
ARG USER_UID=1000
ARG USER_GID=1000
RUN groupadd --gid ${USER_GID} ${USERNAME} \
    && useradd --uid ${USER_UID} --gid ${USER_GID} -m -s /bin/bash ${USERNAME} \
    && echo "${USERNAME} ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/${USERNAME} \
    && chmod 0440 /etc/sudoers.d/${USERNAME}

# Put uv on the non-root user's PATH too.
RUN cp -r /root/.local /home/${USERNAME}/.local \
    && chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}/.local

USER ${USERNAME}
ENV PATH="/home/claude/.local/bin:${PATH}"
WORKDIR /workspace
