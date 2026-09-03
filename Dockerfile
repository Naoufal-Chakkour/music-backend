FROM node:18-slim

RUN apt-get update \
    && apt-get install -y python3 python-is-python3 ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# تثبيت أحدث yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "start"]