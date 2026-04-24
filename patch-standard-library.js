const fs = require('fs');
const path = require('path');

const filePath = path.join(
  process.env.USERPROFILE,
  '.gradle/caches/8.14.3/transforms/927161cea7e02123f3af625dac28d8cf/transformed/react-android-0.81.5-release/prefab/modules/reactnative/include/react/renderer/core/graphicsConversions.h'
);

if (fs.existsSync(filePath)) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('std::format("{}%", dimension.value)')) {
    console.log('Patching graphicsConversions.h...');
    content = content.replace(
      'std::format("{}%", dimension.value)',
      'std::to_string(dimension.value) + "%"'
    );
    fs.writeFileSync(filePath, content);
    console.log('Patch successful!');
  }
} else {
  console.log('Cache file not found yet. Run the build first.');
}