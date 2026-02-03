// Sub-region AOI (Rondônia hotspot)
var testAOI = ee.Geometry.Rectangle([-65, -13, -60, -8]);

// Visualize AOI (blue outline)
Map.centerObject(testAOI, 7);
Map.addLayer(testAOI, {color: 'blue', width: 3}, 'Test Sub-Region AOI');

// Cloud mask function
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
             .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask)
              .divide(10000)
              .copyProperties(image, ['system:time_start']);
}

// Reusable max-NDVI mosaic function
function getMaxNDVIMosaic(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = ee.Date.fromYMD(year, 12, 31);
  
  var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(testAOI)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 50))
    .map(maskS2clouds)
    .select(['B2', 'B3', 'B4', 'B8']);
  
  print('Images for year ' + year + ':', collection.size());
  
  var withNDVI = collection.map(function(image) {
    var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
    return image.addBands(ndvi);
  });
  
  return withNDVI.qualityMosaic('NDVI')
    .clip(testAOI)
    .set('year', year);
}

// Compute mosaics
var mosaic2023 = getMaxNDVIMosaic(2023);
var mosaic2024 = getMaxNDVIMosaic(2024);

// --- NDVI mean stats (coarser scale + bestEffort to avoid timeout) ---
print('2023 NDVI mean (coarse estimate):', mosaic2023.select('NDVI').reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: testAOI,
  scale: 100,                // 100m = ~100x fewer pixels, fast
  maxPixels: 1e10,
  bestEffort: true
}));

print('2024 NDVI mean (coarse estimate):', mosaic2024.select('NDVI').reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: testAOI,
  scale: 100,
  maxPixels: 1e10,
  bestEffort: true
}));

// Visualizations
Map.addLayer(mosaic2023,
  {bands: ['B8', 'B4', 'B3'], min: 0, max: 0.3, gamma: 1.4},
  '2023 Max-NDVI False Color');

Map.addLayer(mosaic2023.select('NDVI'),
  {min: -0.2, max: 0.9, palette: ['red', 'yellow', 'lightgreen', 'darkgreen']},
  '2023 NDVI');

Map.addLayer(mosaic2024,
  {bands: ['B8', 'B4', 'B3'], min: 0, max: 0.3, gamma: 1.4},
  '2024 Max-NDVI False Color', false);

Map.addLayer(mosaic2024.select('NDVI'),
  {min: -0.2, max: 0.9, palette: ['red', 'yellow', 'lightgreen', 'darkgreen']},
  '2024 NDVI', false);
  
// 1. NDVI Change (2024 - 2023)
var ndviChange = mosaic2024.select('NDVI')
  .subtract(mosaic2023.select('NDVI'))
  .rename('NDVI_Change');

// Visualization: red/orange = drop, green = increase
Map.addLayer(ndviChange, {
  min: -0.5,
  max: 0.5,
  palette: ['darkred', 'red', 'orange', 'yellow', 'white', 'lightgreen', 'darkgreen']
}, 'NDVI Change 2023 → 2024 (red = drop)');

// 2. Potential forest loss hotspots
// Criteria: NDVI dropped by at least 0.20 AND current NDVI is below 0.55 (not healthy forest)
var lossThreshold = -0.20;
var currentLowThreshold = 0.55;

var lossMask = ndviChange.lt(lossThreshold)
  .and(mosaic2024.select('NDVI').lt(currentLowThreshold));

// Show binary loss mask (red)
Map.addLayer(lossMask.updateMask(lossMask), 
  {palette: ['red']}, 
  'Potential Forest Loss Hotspots');

// Semi-transparent red overlay on top of 2024 false-color mosaic
Map.addLayer(lossMask.updateMask(lossMask), 
  {palette: ['FF000088']}, 
  'Loss Hotspots Overlay on 2024 False Color');

// 3. Estimate loss area at coarser scale for speed (100 m pixels → ~100x fewer)
var areaImageCoarse = lossMask.multiply(ee.Image.pixelArea()).divide(1e6);  // still km²

var lossAreaCoarse = areaImageCoarse.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: testAOI,
  scale: 100,                // coarser = fast
  maxPixels: 1e10,
  bestEffort: true
});

print('Estimated potential forest loss area (km², coarse 100m):', lossAreaCoarse);


print('Loss area (km²) approx:', lossAreaCoarse.get('NDVI_Change'));





// Export 1: NDVI change map (continuous difference values)
Export.image.toDrive({
  image: ndviChange,
  description: 'NDVI_Change_2023_to_2024_Rondonia_Subregion',
  folder: 'Amazon_Deforestation_Project',
  scale: 10,
  region: testAOI,
  maxPixels: 1e13,
  crs: 'EPSG:4326'
});

// Export 2: Binary loss mask (0/1 hotspots)
Export.image.toDrive({
  image: lossMask,
  description: 'Forest_Loss_Hotspots_2023_2024_Rondonia',
  folder: 'Amazon_Deforestation_Project',
  scale: 10,
  region: testAOI,
  maxPixels: 1e13,
  crs: 'EPSG:4326'
});

// Export 3: 2024 false-color mosaic (for Leaflet base layer)
Export.image.toDrive({
  image: mosaic2024,
  description: '2024_FalseColor_Mosaic_Rondonia',
  folder: 'Amazon_Deforestation_Project',
  scale: 10,
  region: testAOI,
  maxPixels: 1e13,
  crs: 'EPSG:4326'
});
