FROM node:20-slim

# الأدوات الأساسية
RUN apt-get update \
    && apt-get install -y \
       python3 \
       python3-pip \
       python-is-python3 \
       ffmpeg \
       git \
       curl \
       unzip \
       build-essential \
       libcairo2-dev \
       libjpeg-dev \
       libpango1.0-dev \
       libgif-dev \
       librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*


# تثبيت Deno
RUN curl -fsSL https://deno.land/install.sh | sh

ENV DENO_INSTALL=/root/.deno
ENV PATH="/root/.deno/bin:${PATH}"


# تثبيت yt-dlp فقط
RUN python3 -m pip install --break-system-packages \
    -U yt-dlp


# تنزيل bgutil بنفس الإصدار الذي سنبنيه
RUN git clone --single-branch --branch 1.3.1 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
    /opt/bgutil-ytdlp-pot-provider


# بناء bgutil
WORKDIR /opt/bgutil-ytdlp-pot-provider/server

RUN npm ci \
    && npx tsc


# تثبيت Python plugin من نفس النسخة
RUN python3 -m pip install --break-system-packages \
    /opt/bgutil-ytdlp-pot-provider


# مشروع Music Backend
WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN chmod +x start.sh


EXPOSE 5000

CMD ["./start.sh"]