from PIL import Image

img = Image.open("logo-novek.jpeg").convert("RGBA")
data = img.getdata()
new_data = []
threshold = 230
for pixel in data:
    if pixel[0] > threshold and pixel[1] > threshold and pixel[2] > threshold:
        new_data.append((255, 255, 255, 0))
    else:
        new_data.append(pixel)
img.putdata(new_data)
img.save("favicon.png", "PNG")
print("favicon.png created successfully")
