FROM node:20-slim

RUN apt-get update \
    && apt-get install -y \
       python3 \
       python3-pip \
       python-is-python3 \
       ffmpeg \
       git \
       build-essential \
       libcairo2-dev \
       libjpeg-dev \
       libpango1.0-dev \
       libgif-dev \
       librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# تثبيت yt-dlp والـPOT plugin
RUN python3 -m pip install --break-system-packages \
    -U yt-dlp \
    bgutil-ytdlp-pot-provider

# تنزيل bgutil POT Provider
RUN git clone --single-branch --branch 1.3.1 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
    /opt/bgutil-ytdlp-pot-provider

# بناء الـProvider
WORKDIR /opt/bgutil-ytdlp-pot-provider/server

RUN npm ci \
    && npx tsc

# مشروعنا
WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN chmod +x start.sh

EXPOSE 5000

CMD ["./start.sh"]