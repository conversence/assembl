/**
 *
 * @module app.tests.objects.spec
 */

import panelViewByPanelSpec from "../objects/viewsFactory.js";
import { expect } from "chai";

describe("Objects Specs", function () {
    describe("viewFactory", function () {
        var model = undefined;
        beforeEach(function () {
            model = new Backbone.Model({
                hidden: false,
                locked: false,
                minimized: false,
                type: "test",
            });
        });

        it("panelViewByPanelSpec should throw an error if invalidPanelSpecModel ", function () {
            var panel = function () {
                return panelViewByPanelSpec.byPanelSpec(model);
            };

            expect(panel).to.throw();
        });
    });
});
