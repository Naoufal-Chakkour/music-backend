FROM node:18-slim

RUN apt-get update \
    && apt-get install -y python3 python-is-python3 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "start"]