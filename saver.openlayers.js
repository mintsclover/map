class Unmined {

    map(mapId, options, regions) {

        const dpiScale = window.devicePixelRatio ?? 1.0;

        const worldMinX = options.minRegionX * 512;
        const worldMinY = options.minRegionZ * 512;
        const worldWidth = (options.maxRegionX + 1 - options.minRegionX) * 512;
        const worldHeight = (options.maxRegionZ + 1 - options.minRegionZ) * 512;

        const worldTileSize = 256;

        const worldMaxZoomFactor = Math.pow(2, options.maxZoom);

        // left, bottom, right, top, Y is negated
        var mapExtent = ol.extent.boundingExtent([
            [worldMinX * worldMaxZoomFactor, -(worldMinY + worldHeight) * worldMaxZoomFactor],
            [(worldMinX + worldWidth) * worldMaxZoomFactor, -worldMinY * worldMaxZoomFactor]]);

        var viewProjection = new ol.proj.Projection({
            code: 'VIEW',
            units: 'pixels',
        });

        var dataProjection = new ol.proj.Projection({
            code: 'DATA',
            units: 'pixels',
        });

        // Coordinate transformation between view and data
        // OpenLayers Y is positive up, world Y is positive down
        ol.proj.addCoordinateTransforms(viewProjection, dataProjection,
            function (coordinate) {
                return [coordinate[0], -coordinate[1]];
            },
            function (coordinate) {
                return [coordinate[0], -coordinate[1]];
            });

        const mapZoomLevels = options.maxZoom - options.minZoom;
        // Resolution for each OpenLayers zoom level        
        var resolutions = new Array(mapZoomLevels + 1);
        for (let z = 0; z < mapZoomLevels + 1; ++z) {
            resolutions[mapZoomLevels - z] = Math.pow(2, z) * dpiScale / worldMaxZoomFactor;
        }

        var tileGrid = new ol.tilegrid.TileGrid({
            extent: mapExtent,
            origin: [0, 0],
            resolutions: resolutions,
            tileSize: worldTileSize / dpiScale
        });

        var unminedLayer =
            new ol.layer.Tile({
                source: new ol.source.XYZ({
                    projection: viewProjection,
                    tileGrid: tileGrid,
                    tilePixelRatio: dpiScale,
                    tileSize: worldTileSize / dpiScale,

                    tileUrlFunction: function (coordinate) {
                        const worldZoom = -(mapZoomLevels - coordinate[0]) + options.maxZoom;
                        const worldZoomFactor = Math.pow(2, worldZoom);

                        const minTileX = Math.floor(worldMinX * worldZoomFactor / worldTileSize);
                        const minTileY = Math.floor(worldMinY * worldZoomFactor / worldTileSize);
                        const maxTileX = Math.ceil((worldMinX + worldWidth) * worldZoomFactor / worldTileSize) - 1;
                        const maxTileY = Math.ceil((worldMinY + worldHeight) * worldZoomFactor / worldTileSize) - 1;

                        const tileX = coordinate[1];
                        const tileY = coordinate[2];

                        const tileBlockSize = worldTileSize / worldZoomFactor;
                        const tileBlockPoint = {
                            x: tileX * tileBlockSize,
                            z: tileY * tileBlockSize
                        };

                        const hasTile = function () {
                            const tileRegionPoint = {
                                x: Math.floor(tileBlockPoint.x / 512),
                                z: Math.floor(tileBlockPoint.z / 512)
                            };
                            const tileRegionSize = Math.ceil(tileBlockSize / 512);

                            for (let x = tileRegionPoint.x; x < tileRegionPoint.x + tileRegionSize; x++) {
                                for (let z = tileRegionPoint.z; z < tileRegionPoint.z + tileRegionSize; z++) {
                                    const group = {
                                        x: Math.floor(x / 32),
                                        z: Math.floor(z / 32)
                                    };
                                    const regionMap = regions.find(e => e.x == group.x && e.z == group.z);
                                    if (regionMap) {
                                        const relX = x - group.x * 32;
                                        const relZ = z - group.z * 32;
                                        const inx = relZ * 32 + relX;
                                        var b = regionMap.m[Math.floor(inx / 32)];
                                        var bit = inx % 32;
                                        var found = (b & (1 << bit)) != 0;
                                        if (found) return true;
                                    }
                                }
                            }
                            return false;
                        };

                        if (tileX >= minTileX
                            && tileY >= minTileY
                            && tileX <= maxTileX
                            && tileY <= maxTileY
                            && hasTile()) {
                            const url = ('tiles/zoom.{z}/{xd}/{yd}/tile.{x}.{y}.' + options.imageFormat)
                                .replace('{z}', worldZoom)
                                .replace('{yd}', Math.floor(tileY / 10))
                                .replace('{xd}', Math.floor(tileX / 10))
                                .replace('{y}', tileY)
                                .replace('{x}', tileX);
                            return url;
                        }
                        else
                            return undefined;
                    }
                })
            });

        var mousePositionControl = new ol.control.MousePosition({
            coordinateFormat: ol.coordinate.createStringXY(0),
            projection: dataProjection
        });

        var map = new ol.Map({
            target: mapId,
            controls: ol.control.defaults().extend([
                mousePositionControl
            ]),
            layers: [
                unminedLayer,
                /*
                new ol.layer.Tile({
                    source: new ol.source.TileDebug({
                        tileGrid: unminedTileGrid,
                        projection: viewProjection
                    })
                })
                */

            ],
            view: new ol.View({
                center: [0, 0],
                extent: mapExtent,
                projection: viewProjection,
                resolutions: tileGrid.getResolutions(),
                maxZoom: mapZoomLevels,
                zoom: mapZoomLevels - options.maxZoom,
                constrainResolution: true,
                showFullExtent: true,
                constrainOnlyCenter: true
            })
        });

        if (options.markers) {
            var markersLayer = this.createMarkersLayer(options.markers, dataProjection, viewProjection, map.getView().getZoom());
            map.addLayer(markersLayer);

            map.getView().on('change:resolution', () => {
                var currentZoom = map.getView().getZoom();
                if (currentZoom % 1 == 0) {
                    //console.log("Current Zoom Level:", currentZoom); // 디버깅용 콘솔 로그
                    markersLayer.getSource().clear();
                    var newMarkersLayer = this.createMarkersLayer(options.markers, dataProjection, viewProjection, currentZoom);
                    map.removeLayer(markersLayer);
                    markersLayer = newMarkersLayer;
                    map.addLayer(markersLayer);
                }
            });

            // 마커 클릭 이벤트 처리 코드 추가
            var clickTolerance = 20;
            var startPixel = null;
            var hitToleranceValue = 20; // 클릭 판정 범위 (픽셀 단위)

            map.on('pointerdown', function (evt) {
                startPixel = evt.pixel;
            });

            map.on('singleclick', function (evt) {
                if (!startPixel) return;

                var endPixel = evt.pixel;
                var deltaX = Math.abs(endPixel[0] - startPixel[0]);
                var deltaY = Math.abs(endPixel[1] - startPixel[1]);
                var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                if (distance > clickTolerance) {
                    // 드래그로 간주하고 클릭 이벤트 무시
                    return;
                }

                var feature = map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
                    return feature;
                }, {
                    hitTolerance: hitToleranceValue
                });

                if (feature && feature.get('markerData')) {
                    var marker = feature.get('markerData');
                    showDetailWindow(marker);
                    focusOnMarker(marker);
                }
            });

        }

        if (options.background) {
            document.getElementById(mapId).style.backgroundColor = options.background;
        }

        this.openlayersMap = map;
        // 여기서 전역으로 노출
        window.map = map; // 이 줄을 추가합니다.
    }

    createMarkersLayer(markers, dataProjection, viewProjection, currentZoom) {
        var features = [];

        for (var i = 0; i < markers.length; i++) {
            var item = markers[i];

            //console.log(`Marker: ${item.text}, MinZoom: ${item.minZoom}, MaxZoom: ${item.maxZoom}, CurrentZoom: ${currentZoom}`); // 디버깅용 콘솔 로그

            if ((item.minZoom === undefined || currentZoom >= item.minZoom) &&
                (item.maxZoom === undefined || currentZoom <= item.maxZoom)) {

                var longitude = item.x;
                var latitude = item.z;

                var feature = new ol.Feature({
                    geometry: new ol.geom.Point(ol.proj.transform([longitude, latitude], dataProjection, viewProjection)),
                    markerData: item // markerData 속성 설정
                });

                var style = new ol.style.Style();
                if (item.image)
                    style.setImage(new ol.style.Icon({
                        src: item.image,
                        anchor: item.imageAnchor,
                        scale: item.imageScale
                    }));

                if (item.text) {
                    style.setText(new ol.style.Text({
                        text: item.text,
                        font: item.font,
                        offsetX: item.offsetX,
                        offsetY: item.offsetY,
                        info: item.info,
                        fill: item.textColor ? new ol.style.Fill({
                            color: item.textColor
                        }) : null,
                        padding: item.textPadding ?? [2, 4, 2, 4],
                        stroke: item.textStrokeColor ? new ol.style.Stroke({
                            color: item.textStrokeColor,
                            width: item.textStrokeWidth
                        }) : null,
                        backgroundFill: item.textBackgroundColor ? new ol.style.Fill({
                            color: item.textBackgroundColor
                        }) : null,
                        backgroundStroke: item.textBackgroundStrokeColor ? new ol.style.Stroke({
                            color: item.textBackgroundStrokeColor,
                            width: item.textBackgroundStrokeWidth
                        }) : null,
                    }));
                }

                feature.setStyle(style);

                features.push(feature);
            }
        }

        var vectorSource = new ol.source.Vector({
            features: features
        });

        var vectorLayer = new ol.layer.Vector({
            source: vectorSource
        });
        return vectorLayer;
    }

    defaultPlayerMarkerStyle = {
        image: "playerimages/default.png",
        imageAnchor: [0.5, 0.5],
        imageScale: 0.25,

        textColor: "white",
        offsetX: 0,
        offsetY: 20,
        font: "14px Arial",
        //textStrokeColor: "black",
        //textStrokeWidth: 2,
        textBackgroundColor: "#00000088",
        //textBackgroundStrokeColor: "black",
        //textBackgroundStrokeWidth: 1,
        textPadding: [2, 4, 2, 4],
    }

    playerToMarker(player) {
        var marker = Object.assign({}, this.defaultPlayerMarkerStyle);
        marker.x = player.x;
        marker.z = player.z;
        marker.text = player.name;
        return marker;
    }

    createPlayerMarkers(players) {
        let markers = players.map(player => this.playerToMarker(player));
        return markers;
    }

}
