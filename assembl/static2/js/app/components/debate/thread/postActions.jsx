import React from 'react';
import { withApollo } from 'react-apollo';
import { Translate } from 'react-redux-i18n';
import { OverlayTrigger } from 'react-bootstrap';
import { MEDIUM_SCREEN_WIDTH } from '../../../constants';
import { answerTooltip, shareTooltip } from '../../common/tooltips';

import Like from '../../svg/like';
import Disagree from '../../svg/disagree';
import DontUnderstand from '../../svg/dontUnderstand';
import MoreInfo from '../../svg/moreInfo';
import getOverflowMenuForPost from './overflowMenu';
import { getConnectedUserId } from '../../../utils/globalFunctions';
import Permissions, { connectedUserCan } from '../../../utils/permissions';
import Sentiments from './sentiments';

class PostActions extends React.Component {
  constructor(props) {
    super(props);
    const screenWidth = window.innerWidth;
    this.state = {
      screenWidth: screenWidth
    };
    this.updateDimensions = this.updateDimensions.bind(this);
  }
  componentDidMount() {
    window.addEventListener('resize', this.updateDimensions);
  }
  componentWillUnmount() {
    window.removeEventListener('resize', this.updateDimensions);
  }
  updateDimensions() {
    const screenWidth = window.innerWidth;
    this.setState({
      screenWidth: screenWidth
    });
  }
  render() {
    const {
      client,
      creatorUserId,
      postId,
      sentimentCounts,
      mySentiment,
      handleAnswerClick,
      handleEditClick,
      postChildren
    } = this.props;
    let count = 0;
    const totalSentimentsCount = sentimentCounts
      ? sentimentCounts.like + sentimentCounts.disagree + sentimentCounts.dontUnderstand + sentimentCounts.moreInfo
      : 0;
    const connectedUserId = getConnectedUserId();
    const userCanDeleteThisMessage =
      (connectedUserId === String(creatorUserId) && connectedUserCan(Permissions.DELETE_MY_POST)) ||
      connectedUserCan(Permissions.DELETE_POST);
    const userCanEditThisMessage =
      (connectedUserId === String(creatorUserId) && connectedUserCan(Permissions.EDIT_MY_POST)) ||
      connectedUserCan(Permissions.EDIT_POST);
    let overflowMenu = null;
    if (userCanDeleteThisMessage || userCanEditThisMessage) {
      overflowMenu = (
        <div className="overflow-action">
          <OverlayTrigger
            trigger="click"
            rootClose
            placement={this.state.screenWidth >= MEDIUM_SCREEN_WIDTH ? 'right' : 'top'}
            overlay={getOverflowMenuForPost(postId, userCanDeleteThisMessage, userCanEditThisMessage, client, handleEditClick)}
          >
            <div>
              {this.state.screenWidth >= MEDIUM_SCREEN_WIDTH
                ? <span className="assembl-icon-ellipsis-vert">&nbsp;</span>
                : <span className="assembl-icon-ellipsis">&nbsp;</span>}
            </div>
          </OverlayTrigger>
        </div>
      );
    }
    return (
      <div>
        <div className="post-icons">
          {connectedUserCan(Permissions.ADD_POST)
            ? <div className="post-action" onClick={handleAnswerClick}>
              <OverlayTrigger placement={this.state.screenWidth >= MEDIUM_SCREEN_WIDTH ? 'right' : 'top'} overlay={answerTooltip}>
                <span className="assembl-icon-back-arrow color" />
              </OverlayTrigger>
            </div>
            : null}
          <div className="post-action">
            <OverlayTrigger placement={this.state.screenWidth >= MEDIUM_SCREEN_WIDTH ? 'right' : 'top'} overlay={shareTooltip}>
              <span className="assembl-icon-share color" />
            </OverlayTrigger>
          </div>
          <Sentiments mySentiment={mySentiment} screenWidth={this.state.screenWidth} client={client} postId={postId} />
          {this.state.screenWidth >= MEDIUM_SCREEN_WIDTH ? null : overflowMenu}
        </div>
        {totalSentimentsCount > 0 &&
          <div className="sentiments-count margin-m">
            <div>
              {Object.keys(sentimentCounts).map((sentiment, index) => {
                if (sentimentCounts[sentiment] > 0 && sentiment === 'like') {
                  return (
                    <div className="min-sentiment" key={index} style={{ left: `${(count += 1 * 6)}px` }}>
                      <Like size={15} />
                    </div>
                  );
                }
                if (sentimentCounts[sentiment] > 0 && sentiment === 'disagree') {
                  return (
                    <div className="min-sentiment" key={index} style={{ left: `${(count += 1 * 6)}px` }}>
                      <Disagree size={15} />
                    </div>
                  );
                }
                if (sentimentCounts[sentiment] > 0 && sentiment === 'dontUnderstand') {
                  return (
                    <div className="min-sentiment" key={index} style={{ left: `${(count += 1 * 6)}px` }}>
                      <DontUnderstand size={15} />
                    </div>
                  );
                }
                if (sentimentCounts[sentiment] > 0 && sentiment === 'moreInfo') {
                  return (
                    <div className="min-sentiment" key={index} style={{ left: `${(count += 1 * 6)}px` }}>
                      <MoreInfo size={15} />
                    </div>
                  );
                }
                return null;
              })}
            </div>
            <div className="txt">
              {this.state.screenWidth >= MEDIUM_SCREEN_WIDTH
                ? totalSentimentsCount
                : <Translate value="debate.thread.numberOfReactions" count={totalSentimentsCount} />}
            </div>
          </div>}
        {this.state.screenWidth >= MEDIUM_SCREEN_WIDTH ? overflowMenu : null}
        <div className="answers annotation">
          <Translate value="debate.thread.numberOfResponses" count={postChildren ? postChildren.length : 0} />
        </div>
        <div className="clear">&nbsp;</div>
      </div>
    );
  }
}

export default withApollo(PostActions);