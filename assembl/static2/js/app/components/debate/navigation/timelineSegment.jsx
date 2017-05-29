import React from 'react';
import { browserHistory } from 'react-router';
import { Translate, Localize, I18n } from 'react-redux-i18n';
import { connect } from 'react-redux';
import { get } from '../../../utils/routeMap';
import { displayModal } from '../../../utils/utilityManager';
import { getPhaseStatus, isSeveralIdentifiers, getStartDatePhase, getPhaseName } from '../../../utils/timeline';

class TimelineSegment extends React.Component {
  constructor(props) {
    super(props);
    this.displayPhase = this.displayPhase.bind(this);
  }
  displayPhase() {
    const { locale } = this.props.i18n;
    const { phaseIdentifier } = this.props;
    const { debateData } = this.props.debate;
    const slug = { slug: debateData.slug };
    const phaseName = getPhaseName(debateData.timeline, phaseIdentifier, locale).toLowerCase();
    const isSeveralPhases = isSeveralIdentifiers(debateData.timeline);
    const phaseStatus = getPhaseStatus(debateData.timeline, phaseIdentifier);
    if (isSeveralPhases) {
      if (phaseStatus === 'notStarted') {
        const startDate = getStartDatePhase(debateData.timeline, phaseIdentifier);
        const body = <div><Translate value="debate.notStarted" phaseName={phaseName} /><Localize value={startDate} dateFormat="date.format" /></div>;
        displayModal(null, body, true, null, null, true);
      }
      if (phaseStatus === 'inProgress' || phaseStatus === 'completed') {
        if (phaseIdentifier === 'survey') {
          browserHistory.push(`${get('debate', slug)}?phase=${phaseIdentifier}`);
        } else {
          const body = <Translate value="redirectToV1" phaseName={phaseName} />;
          const button = { link: `${get('oldDebate', slug)}`, label: I18n.t('home.accessButton'), internalLink: false };
          displayModal(null, body, true, null, button, true);
          setTimeout(() => {
            window.location = `${get('oldDebate', slug)}`;
          }, 6000);
        }
      }
    } else {
      if (phaseIdentifier === 'survey') {
        browserHistory.push(`${get('debate', slug)}?phase=${phaseIdentifier}`);
      } else {
        window.location = `${get('oldDebate', slug)}`;
      }
    }
  }
  render() {
    const {
      index,
      barWidth,
      identifier,
      isCurrentPhase,
      isStepCompleted,
      phaseIdentifier,
      title,
      locale
    } = this.props;
    return (
      <div className="minimized-timeline" style={{ marginLeft: `${index * 100}px` }}>
        {title.entries.map((entry, index2) => { // eslint-disable-line
          if (locale === entry['@language']) {
            return (
              <div onClick={this.displayPhase} className={identifier === phaseIdentifier ? 'timeline-title txt-active' : 'timeline-title txt-not-active'} key={index2}>
                <div className="timeline-link">
                  { entry.value }
                </div>
              </div>
            );
          }
        })}
        <div className={isStepCompleted || isCurrentPhase ? 'timeline-number active' : 'timeline-number not-active'}>
          {isStepCompleted ? <span className="assembl-icon-checked white" /> : <span>{index + 1}</span>}
        </div>
        <div className="timeline-bar-2" style={{ width: `${barWidth}px` }}>&nbsp;</div>
        <div className="timeline-bar-1">&nbsp;</div>
      </div>
    );
  }
}

const mapStateToProps = (state) => {
  return {
    i18n: state.i18n,
    debate: state.debate
  };
};

export default connect(mapStateToProps)(TimelineSegment);