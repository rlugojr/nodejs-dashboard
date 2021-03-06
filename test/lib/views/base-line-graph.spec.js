"use strict";

var contrib = require("blessed-contrib");
var expect = require("chai").expect;
var _ = require("lodash");
var sinon = require("sinon");

var BaseView = require("../../../lib/views/base-view");
var BaseLineGraph = require("../../../lib/views/base-line-graph");
var utils = require("../../utils");

describe("BaseLineGraph", function () {

  var sandbox;
  var testContainer;
  var options;

  before(function () {
    sandbox = sinon.sandbox.create();
  });

  beforeEach(function () {
    utils.stubWidgets(sandbox);
    testContainer = utils.getTestContainer(sandbox);
    options = {
      parent: testContainer,
      label: "graph A",
      layoutConfig: {
        getPosition: function () { return { top: "10%" }; },
        limit: 10
      }
    };
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("constructor", function () {

    beforeEach(function () {
      sandbox.stub(BaseLineGraph.prototype, "_createGraph");
    });

    it("should require label option", function () {
      delete options.label;
      expect(function () {
        new BaseLineGraph(options); // eslint-disable-line no-new
      }).to.throw("BaseLineGraph requires 'label' option");
    });

    it("should use limit from layoutConfig", function () {
      var limit = 7;
      options.layoutConfig.limit = limit;
      var baseGraph = new BaseLineGraph(options);
      expect(baseGraph).to.have.deep.property("layoutConfig.limit", limit);
      expect(baseGraph).to.have.property("maxLimit", limit);
      expect(baseGraph).to.have.property("values").that.deep.equals(_.times(limit, _.constant(0)));
    });

    it("should create graph and set up event listener", function () {
      var baseGraph = new BaseLineGraph(options);
      expect(baseGraph).to.be.an.instanceof(BaseView);
      expect(baseGraph._createGraph).to.have.been.calledOnce;
      expect(testContainer.screen.on).to.have.been.calledWithExactly("metrics", sinon.match.func);
    });
  });

  describe("onEvent", function () {

    it("should throw an error because it's meant to be overwritten by child class", function () {
      var baseGraph = new BaseLineGraph(options);
      expect(function () {
        baseGraph.onEvent();
      }).to.throw("BaseLineGraph onEvent should be overwritten");
    });
  });

  describe("setLayout", function () {

    it("should call _handleLimitChanged and recalculatePosition", function () {
      var baseGraph = new BaseLineGraph(options);
      sandbox.spy(baseGraph, "_handleLimitChanged");
      sandbox.spy(baseGraph, "recalculatePosition");
      baseGraph.setLayout(options.layoutConfig);
      expect(baseGraph.recalculatePosition).to.have.been.calledOnce;
      expect(baseGraph._handleLimitChanged).to.have.been.calledOnce;
    });
  });

  describe("recalculatePosition", function () {

    it("should set new position and recreate node", function () {
      var baseGraph = new BaseLineGraph(options);

      sandbox.spy(testContainer, "remove");
      sandbox.spy(testContainer, "append");
      sandbox.spy(baseGraph.node, "setBack");
      sandbox.stub(baseGraph, "getPosition").returns({ top: "20%" });
      baseGraph.recalculatePosition();

      expect(baseGraph.node).to.have.property("position").that.deep.equals({ top: "20%" });
      expect(testContainer.remove).to.have.been.calledOnce;
      expect(testContainer.append).to.have.been.calledOnce;
      expect(baseGraph.node.setBack).to.have.been.calledOnce;
    });

    it("should do nothing if position is unchanged", function () {
      options.layoutConfig.getPosition = function () { return { top: "10%" }; };
      var baseGraph = new BaseLineGraph(options);
      var originalPosition = baseGraph.node.position;

      sandbox.spy(testContainer, "remove");
      sandbox.stub(baseGraph, "getPosition").returns({ top: "10%" });
      baseGraph.recalculatePosition();

      expect(baseGraph.node).to.have.property("position", originalPosition);
      expect(testContainer.remove).to.have.not.been.called;
    });
  });

  describe("_handleLimitChanged", function () {

    it("should update x series and backfill values", function () {
      var originalLimit = 3;
      var newLimit = 7;

      options.layoutConfig.limit = originalLimit;
      var baseGraph = new BaseLineGraph(options);
      expect(baseGraph).to.have.property("maxLimit", originalLimit);
      baseGraph.values = [8, 7, 6]; // eslint-disable-line no-magic-numbers

      baseGraph.layoutConfig.limit = newLimit;
      sandbox.spy(Math, "max");
      baseGraph._handleLimitChanged();

      expect(Math.max).to.have.been.calledOnce;
      expect(baseGraph).to.have.property("maxLimit", newLimit);
      // eslint-disable-next-line no-magic-numbers
      expect(baseGraph).to.have.property("values").that.deep.equals([ 0, 0, 0, 0, 8, 7, 6 ]);
    });

    it("should do nothing if limit is unchanged", function () {
      var baseGraph = new BaseLineGraph(options);
      var originalLayoutConfig = baseGraph.layoutConfig;
      var originalValues = baseGraph.values;

      sandbox.spy(Math, "max");
      baseGraph._handleLimitChanged();

      expect(Math.max).to.have.not.been.called;
      expect(baseGraph).to.have.property("maxLimit", originalLayoutConfig.limit);
      expect(baseGraph).to.have.property("values", originalValues);
    });
  });

  describe("update", function () {

    /* eslint-disable no-magic-numbers */

    it("should update values and label", function () {
      options.layoutConfig.limit = 4;
      options.label = "cpu";
      options.unit = "%";
      var baseGraph = new BaseLineGraph(options);
      expect(baseGraph).to.have.property("values").that.deep.equals([0, 0, 0, 0]);
      expect(baseGraph).to.have.deep.property("series.y").that.deep.equals(baseGraph.values);

      baseGraph.update(29);
      expect(baseGraph).to.have.property("values").that.deep.equals([0, 0, 0, 29]);
      expect(baseGraph).to.have.deep.property("series.y").that.deep.equals(baseGraph.values);
      expect(baseGraph.node.setLabel).to.have.been.calledWith(" cpu (29%) ");

      baseGraph.update(8);
      expect(baseGraph).to.have.property("values").that.deep.equals([0, 0, 29, 8]);
      expect(baseGraph).to.have.deep.property("series.y").that.deep.equals(baseGraph.values);
      expect(baseGraph.node.setLabel).to.have.been.calledWith(" cpu (8%) ");
    });

    it("should update highwater series", function () {
      options.layoutConfig.limit = 3;
      options.highwater = true;
      var baseGraph = new BaseLineGraph(options);

      expect(baseGraph).to.have.property("values").that.deep.equals([0, 0, 0]);
      expect(baseGraph).to.have.property("highwaterSeries").that.deep.equals({
        x: ["2", "1", "0"],
        style: { line: "red" }
      });

      baseGraph.update(2, 4);
      expect(baseGraph).to.have.property("values").that.deep.equals([0, 0, 2]);
      expect(baseGraph).to.have.property("highwaterSeries").that.deep.equals({
        x: ["2", "1", "0"],
        y: [4, 4, 4],
        style: { line: "red" }
      });
      expect(baseGraph.node.setLabel).to.have.been.calledWith(" graph A (2), high (4) ");
    });

    it("should update series correctly when values length > limit", function () {
      options.layoutConfig.limit = 5;
      options.highwater = true;
      var baseGraph = new BaseLineGraph(options);

      baseGraph.layoutConfig.limit = 3;
      baseGraph._handleLimitChanged();

      baseGraph.update(27, 27);
      expect(baseGraph).to.have.property("values").that.deep.equals([0, 0, 0, 0, 27]);
      expect(baseGraph).to.have.deep.property("series.y").that.deep.equals([0, 0, 27]);
      expect(baseGraph).to.have.deep.property("highwaterSeries.y").that.deep.equals([27, 27, 27]);
    });

    /* eslint-enable no-magic-numbers */
  });

  describe("_createGraph", function () {

    it("should create a blessed-contrib line graph", function () {
      sandbox.spy(testContainer, "append");
      options.layoutConfig.limit = 8;
      sandbox.stub(BaseLineGraph.prototype, "_createGraph");
      var baseGraph = new BaseLineGraph(options);
      BaseLineGraph.prototype._createGraph.restore();

      expect(baseGraph).to.not.have.property("node");

      baseGraph._createGraph(options);

      expect(baseGraph).to.have.property("node").that.is.an.instanceof(contrib.line);
      expect(baseGraph.node).to.have.deep.property("options.label", " graph A ");
      expect(baseGraph.node).to.have.deep.property("options.maxY", undefined);
      expect(baseGraph.node).to.have.property("position")
        .that.deep.equals(options.layoutConfig.getPosition(options.parent));

      expect(testContainer.append).to.have.been.calledOnce.and.calledWithExactly(baseGraph.node);
    });

    it("should create a series and trim values based on limit", function () {
      sandbox.stub(BaseLineGraph.prototype, "_createGraph");
      options.layoutConfig.limit = 4;
      var baseGraph = new BaseLineGraph(options);
      BaseLineGraph.prototype._createGraph.restore();

      baseGraph.values = [2, 3, 4, 5, 6, 7, 8, 9]; // eslint-disable-line no-magic-numbers

      baseGraph._createGraph(options);

      expect(baseGraph).to.have.property("series").that.deep.equals({
        x: ["3", "2", "1", "0"],
        y: [6, 7, 8, 9] // eslint-disable-line no-magic-numbers
      });

      expect(baseGraph.node.setData).to.have.been.calledOnce
        .and.calledWithExactly([baseGraph.series]);
    });

    it("should initialize highwater series if option is set", function () {
      sandbox.stub(BaseLineGraph.prototype, "_createGraph");
      options.highwater = true;
      var baseGraph = new BaseLineGraph(options);
      BaseLineGraph.prototype._createGraph.restore();

      expect(baseGraph).to.not.have.property("highwaterSeries");
      baseGraph._createGraph(options);

      expect(baseGraph).to.have.property("highwaterSeries").that.deep.equals({
        x: ["9", "8", "7", "6", "5", "4", "3", "2", "1", "0"],
        style: { line: "red" }
      });

      expect(baseGraph.node.setData).to.have.been.calledOnce
        .and.calledWithExactly([baseGraph.series]);
    });
  });
});
