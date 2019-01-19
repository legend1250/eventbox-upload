#------------------------------------------------------
#               Server upload build begin
#------------------------------------------------------
## Specifies the base image we're extending
FROM node:alpine

## Create base directory
RUN mkdir -p /app/server

## Specify the "working directory" for the rest of the Dockerfile
WORKDIR /app/server

## Install packages using NPM 5 (bundled with the node:9 image)
COPY ["./package.json", "./yarn.lock", "/app/server/"]
RUN yarn install

## Add application code
COPY ["./server.js", "/app/server/"]
COPY ["./.env", "/app/server/"]

# CMD [ "yarn", "start" ]

# EXPOSE 3000