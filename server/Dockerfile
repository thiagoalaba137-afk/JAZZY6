FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node relay.mjs server.mjs accounts.mjs friends.mjs initial-accounts.mjs ./
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=8787 JAZZY_DATA_DIR=/app/data
EXPOSE 8787
CMD ["node", "server.mjs"]
