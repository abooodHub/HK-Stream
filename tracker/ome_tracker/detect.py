"""كشف نوع الجهاز والمتصفّح من User-Agent — دوال نقيّة بلا حالة."""


def detect_device(ua):
    u = ua.lower()
    if any(x in u for x in ["tv","tizen","webos","smarttv","smart-tv","googletv","appletv","apple-tv","firetv","firestick","roku","chromecast","playstation","ps5","ps4","xbox","nintendo","vidaa","bravia","viera","philips","hisense","hbbtv","afts","aftb","aftm","aftn","crkey","mibox","mitv","shield"]): return "tv"
    if any(x in u for x in ["ipad","tablet","kindle","silk"]): return "tablet"
    if any(x in u for x in ["mobile","android","iphone","ipod","windows phone"]): return "phone"
    return "desktop"


def detect_device_name(ua):
    u = ua.lower()

    # Smart TVs and Media Devices
    if "appletv" in u or "apple-tv" in u:
        return "جهاز Apple TV"
    if "googletv" in u:
        return "Google TV"
    if any(x in u for x in ["firetv", "firestick", "afts", "aftb", "aftm", "aftn"]):
        return "جهاز Fire TV"
    if "roku" in u:
        return "جهاز Roku"
    if "chromecast" in u or "crkey" in u:
        return "جهاز Chromecast"
    if "mibox" in u or "mitv" in u:
        return "جهاز Xiaomi TV"
    if "shield" in u:
        return "جهاز Nvidia Shield"
    if "tizen" in u:
        return "شاشة Samsung ذكية"
    if "webos" in u:
        return "شاشة LG ذكية"
    if "vidaa" in u:
        return "شاشة هايسنس ذكية"
    if "bravia" in u or "sony tv" in u:
        return "شاشة سوني ذكية"
    if "philips" in u:
        return "شاشة فيليبس ذكية"
    if "viera" in u:
        return "شاشة باناسونيك"
    if "hbbtv" in u:
        return "تلفاز ذكي (HbbTV)"
    if "smarttv" in u or "smart-tv" in u:
        return "تلفاز ذكي"
    if any(x in u for x in ["opera tv", "nettv", "aquos"]):
        return "تلفاز ذكي"

    # Game Consoles
    if "playstation" in u:
        if "playstation 5" in u or "ps5" in u: return "بلايستيشن 5"
        if "playstation 4" in u or "ps4" in u: return "بلايستيشن 4"
        return "جهاز بلايستيشن"
    if "xbox" in u:
        return "جهاز إكس بوكس"
    if "nintendo" in u:
        return "نينتندو سويتش"

    # Tablets
    if "ipad" in u:
        return "آيباد (iPad)"
    if "tablet" in u:
        if "android" in u: return "تابلت أندرويد"
        return "جهاز لوحي"
    if "kindle" in u or "silk" in u:
        return "جهاز كيندل"

    # Mobile Phones
    if "iphone" in u:
        return "آيفون (iPhone)"
    if "ipod" in u:
        return "iPod Touch"
    if "mobile" in u:
        if "android" in u: return "جوال أندرويد"
        if "windows phone" in u: return "ويندوز فون"
        return "هاتف جوال"

    # Desktops / OS
    if "windows" in u:
        return "كمبيوتر ويندوز"
    if "macintosh" in u or "mac os x" in u:
        return "جهاز ماك (Mac)"
    if "linux" in u:
        if "android" not in u:
            return "كمبيوتر لينكس"
    if "cros" in u:
        return "جهاز كروم بوك"

    if "android" in u:
        return "جهاز أندرويد"

    return "كمبيوتر مكتبي"


def detect_browser(ua):
    u = ua.lower()
    if "edg/" in u or "edge/" in u: return "Edge"
    if "opr/" in u or "opera" in u: return "Opera"
    if "samsungbrowser" in u:        return "Samsung"   # قبل Chrome — UA سامسونج يحوي chrome أيضاً
    if "chrome/" in u:               return "Chrome"
    if "firefox/" in u:              return "Firefox"
    if "safari/" in u:               return "Safari"
    if "trident/" in u or "msie" in u: return "IE"
    return "Other"
